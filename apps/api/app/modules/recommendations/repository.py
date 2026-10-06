"""Vector queries. Every storefront-facing read goes through `_published`, the
same visibility rule as the catalog (published, and platform-owned or sold by
an approved vendor), so recommendations never surface hidden products."""

import uuid
from collections.abc import Sequence

from sqlalchemy import case, func, literal, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import FragranceNote, Product
from app.modules.catalog.repository import published as _published
from app.modules.orders.models import Order, OrderItem
from app.modules.recommendations.models import ProductEmbedding
from app.modules.wishlist.models import WishlistItem
from app.shared.enums import OrderStatus

# Recall for filtered HNSW queries: the index returns ef_search candidates and the
# visibility filter is applied after, so leave headroom above the page size.
EF_SEARCH = 200
BOUGHT = (OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED)


async def products_by_ids(db: AsyncSession, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Product]:
    if not ids:
        return {}
    rows = await db.scalars(select(Product).where(Product.id.in_(ids)))
    return {p.id: p for p in rows.unique()}


async def all_product_ids(db: AsyncSession) -> list[uuid.UUID]:
    return list((await db.scalars(select(Product.id).order_by(Product.created_at))).all())


async def embedding_meta(
    db: AsyncSession, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, tuple[str, str]]:
    """product_id → (model, content_hash) for rows that exist."""
    if not ids:
        return {}
    rows = await db.execute(
        select(
            ProductEmbedding.product_id, ProductEmbedding.model, ProductEmbedding.content_hash
        ).where(ProductEmbedding.product_id.in_(ids))
    )
    return {pid: (m, h) for pid, m, h in rows}


async def upsert(
    db: AsyncSession, product_id: uuid.UUID, vector: list[float], model: str, content_hash: str
) -> None:
    stmt = insert(ProductEmbedding).values(
        product_id=product_id, embedding=vector, model=model, content_hash=content_hash
    )
    await db.execute(
        stmt.on_conflict_do_update(
            index_elements=[ProductEmbedding.product_id],
            set_={
                "embedding": stmt.excluded.embedding,
                "model": stmt.excluded.model,
                "content_hash": stmt.excluded.content_hash,
                "updated_at": func.now(),
            },
        )
    )


async def vector_of(db: AsyncSession, product_id: uuid.UUID) -> list[float] | None:
    v = await db.scalar(
        select(ProductEmbedding.embedding).where(ProductEmbedding.product_id == product_id)
    )
    return list(v) if v is not None else None


async def count_embedded(db: AsyncSession, model: str) -> tuple[int, int]:
    """(rows embedded with `model`, rows embedded with any other model)."""
    current = ProductEmbedding.model == model
    row = (
        await db.execute(
            select(func.count().filter(current), func.count().filter(~current)).select_from(
                ProductEmbedding
            )
        )
    ).one()
    return int(row[0]), int(row[1])


async def count_products(db: AsyncSession) -> int:
    return await db.scalar(select(func.count()).select_from(Product)) or 0


async def nearest(
    db: AsyncSession,
    vector: list[float],
    limit: int,
    *,
    exclude: Sequence[uuid.UUID] = (),
    gender: str | None = None,
    max_price: float | None = None,
) -> list[tuple[Product, float]]:
    """Visible products by cosine similarity to `vector` (1 = identical)."""
    await db.execute(text(f"SET LOCAL hnsw.ef_search = {EF_SEARCH}"))
    distance = ProductEmbedding.embedding.cosine_distance(vector)
    stmt = (
        _published(select(Product, distance.label("d")))
        .join(ProductEmbedding, ProductEmbedding.product_id == Product.id)
        .order_by(distance)
        .limit(limit)
    )
    if exclude:
        stmt = stmt.where(Product.id.not_in(exclude))
    if gender:
        stmt = stmt.where(Product.gender.in_((gender, "UNISEX")))
    if max_price is not None:
        stmt = stmt.where(Product.base_price <= max_price)
    rows = (await db.execute(stmt)).unique().all()
    return [(p, 1.0 - float(d)) for p, d in rows]


async def keyword(db: AsyncSession, q: str, limit: int) -> list[Product]:
    """Fallback when no vector is available: words matched in name/descriptions."""
    words = [w for w in q.lower().split() if len(w) > 2][:6]
    if not words:
        return []
    haystack = func.concat_ws(" ", Product.name, Product.short_description, Product.description)
    hits = sum((case((haystack.ilike(f"%{w}%"), 1), else_=0) for w in words), start=literal(0))
    stmt = (
        _published(select(Product))
        .where(hits > 0)
        .order_by(hits.desc(), Product.rating_count.desc())
        .limit(limit)
    )
    return list((await db.scalars(stmt)).unique().all())


async def history(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 30
) -> list[tuple[uuid.UUID, float]]:
    """(product_id, weight) the user has shown interest in: bought (2.0) and
    wishlisted (1.0), most recent first."""
    bought = await db.execute(
        select(OrderItem.product_id, func.max(Order.created_at))
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.user_id == user_id, Order.status.in_(BOUGHT), OrderItem.product_id.is_not(None)
        )
        .group_by(OrderItem.product_id)
        .order_by(func.max(Order.created_at).desc())
        .limit(limit)
    )
    wished = await db.execute(
        select(WishlistItem.product_id)
        .where(WishlistItem.user_id == user_id)
        .order_by(WishlistItem.created_at.desc())
        .limit(limit)
    )
    weights: dict[uuid.UUID, float] = {}
    for pid, _ in bought:
        weights[pid] = weights.get(pid, 0) + 2.0
    for (pid,) in wished:
        weights[pid] = weights.get(pid, 0) + 1.0
    return list(weights.items())


async def vectors_of(db: AsyncSession, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, list[float]]:
    if not ids:
        return {}
    rows = await db.execute(
        select(ProductEmbedding.product_id, ProductEmbedding.embedding).where(
            ProductEmbedding.product_id.in_(ids)
        )
    )
    return {pid: list(v) for pid, v in rows}


async def notes_by_slugs(db: AsyncSession, slugs: Sequence[str]) -> list[FragranceNote]:
    if not slugs:
        return []
    return list(
        (await db.scalars(select(FragranceNote).where(FragranceNote.slug.in_(slugs)))).all()
    )


async def popular(db: AsyncSession, limit: int, exclude: Sequence[uuid.UUID] = ()) -> list[Product]:
    stmt = _published(select(Product)).order_by(
        Product.is_featured.desc(), Product.rating_count.desc(), Product.rating_avg.desc()
    )
    if exclude:
        stmt = stmt.where(Product.id.not_in(exclude))
    return list((await db.scalars(stmt.limit(limit))).unique().all())

"""Server-side wishlist. Returns full ProductSummary items so the web can render
cards directly. Add is idempotent; merge folds a guest's local list in on login."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import Product
from app.modules.catalog.schemas import ProductSummary
from app.modules.catalog.service import to_summary
from app.modules.wishlist.models import WishlistItem
from app.shared.enums import ProductStatus


async def _product_ids(db: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    rows = await db.scalars(select(WishlistItem.product_id).where(WishlistItem.user_id == user_id))
    return set(rows)


async def list_items(db: AsyncSession, user_id: uuid.UUID) -> list[ProductSummary]:
    stmt = (
        select(Product)
        .join(WishlistItem, WishlistItem.product_id == Product.id)
        .where(WishlistItem.user_id == user_id, Product.status == ProductStatus.PUBLISHED)
        .order_by(WishlistItem.created_at.desc())
    )
    rows = (await db.scalars(stmt)).unique().all()
    return [to_summary(p) for p in rows]


async def add(db: AsyncSession, user_id: uuid.UUID, product_id: uuid.UUID) -> list[ProductSummary]:
    product = await db.get(Product, product_id)
    if product is not None and product_id not in await _product_ids(db, user_id):
        db.add(WishlistItem(user_id=user_id, product_id=product_id, created_at=datetime.now(UTC)))
        await db.commit()
    return await list_items(db, user_id)


async def remove(
    db: AsyncSession, user_id: uuid.UUID, product_id: uuid.UUID
) -> list[ProductSummary]:
    await db.execute(
        delete(WishlistItem).where(
            WishlistItem.user_id == user_id, WishlistItem.product_id == product_id
        )
    )
    await db.commit()
    return await list_items(db, user_id)


async def merge(
    db: AsyncSession, user_id: uuid.UUID, product_ids: list[uuid.UUID]
) -> list[ProductSummary]:
    if product_ids:
        existing = await _product_ids(db, user_id)
        # Only merge ids that are real products and not already saved.
        valid = set(
            (
                await db.scalars(
                    select(Product.id).where(Product.id.in_(set(product_ids) - existing))
                )
            ).all()
        )
        now = datetime.now(UTC)
        for pid in valid:
            db.add(WishlistItem(user_id=user_id, product_id=pid, created_at=now))
        if valid:
            await db.commit()
    return await list_items(db, user_id)

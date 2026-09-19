import uuid
from decimal import Decimal

from sqlalchemy import Select, Text, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import Brand, Category, Product, ProductVariant
from app.modules.catalog.schemas import ProductFilters
from app.shared.enums import ProductStatus


def _published(stmt: Select) -> Select:
    return stmt.where(Product.status == ProductStatus.PUBLISHED)


async def category_ids_in_subtree(db: AsyncSession, slug: str) -> list[uuid.UUID] | None:
    """Return the category and all descendants, or None if the slug doesn't exist."""
    root = await db.scalar(select(Category).where(Category.slug == slug, Category.is_active))
    if root is None:
        return None

    tree = select(Category.id).where(Category.id == root.id).cte("subtree", recursive=True)
    child = select(Category.id).join(tree, Category.parent_id == tree.c.id)
    tree = tree.union_all(child)
    rows = await db.scalars(select(tree.c.id))
    return list(rows)


def apply_filters(stmt: Select, f: ProductFilters, category_ids: list[uuid.UUID] | None) -> Select:
    if f.q:
        pattern = f"%{f.q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(pattern),
                Product.short_description.ilike(pattern),
                Product.description.ilike(pattern),
                # jsonb can only be cast to text (not varchar); enables tag matches.
                Product.tags.cast(Text).ilike(pattern),
            )
        )
    if category_ids is not None:
        stmt = stmt.where(Product.category_id.in_(category_ids))
    if f.brand:
        stmt = stmt.where(Product.brand.has(Brand.slug == f.brand))
    if f.product_type:
        stmt = stmt.where(Product.product_type == f.product_type)
    if f.min_price is not None:
        stmt = stmt.where(Product.base_price >= f.min_price)
    if f.max_price is not None:
        stmt = stmt.where(Product.base_price <= f.max_price)
    if f.featured is not None:
        stmt = stmt.where(Product.is_featured == f.featured)
    if f.in_stock:
        stmt = stmt.where(
            exists().where(
                ProductVariant.product_id == Product.id, ProductVariant.stock_quantity > 0
            )
        )
    return stmt


def apply_sort(stmt: Select, sort: str) -> Select:
    match sort:
        case "price_asc":
            return stmt.order_by(Product.base_price.asc(), Product.name)
        case "price_desc":
            return stmt.order_by(Product.base_price.desc(), Product.name)
        case "name":
            return stmt.order_by(Product.name.asc())
        case "rating":
            return stmt.order_by(Product.rating_avg.desc(), Product.rating_count.desc())
        case "featured":
            return stmt.order_by(Product.is_featured.desc(), Product.published_at.desc())
        case _:
            return stmt.order_by(
                Product.published_at.desc().nulls_last(), Product.created_at.desc()
            )


async def list_products(
    db: AsyncSession,
    f: ProductFilters,
    category_ids: list[uuid.UUID] | None,
    offset: int,
    limit: int,
) -> tuple[list[Product], int]:
    base = apply_filters(_published(select(Product)), f, category_ids)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    stmt = apply_sort(base, f.sort).offset(offset).limit(limit)
    rows = (await db.scalars(stmt)).unique().all()
    return list(rows), total


async def get_product_by_slug(db: AsyncSession, slug: str) -> Product | None:
    stmt = _published(select(Product)).where(Product.slug == slug)
    return (await db.scalars(stmt)).unique().first()


async def related_products(db: AsyncSession, product: Product, limit: int = 4) -> list[Product]:
    stmt = (
        _published(select(Product))
        .where(Product.id != product.id)
        .where(
            or_(
                Product.category_id == product.category_id,
                Product.brand_id == product.brand_id,
            )
        )
        .order_by(Product.is_featured.desc(), Product.rating_avg.desc())
        .limit(limit)
    )
    return list((await db.scalars(stmt)).unique().all())


async def list_categories(db: AsyncSession) -> list[Category]:
    stmt = select(Category).where(Category.is_active).order_by(Category.sort_order, Category.name)
    return list((await db.scalars(stmt)).all())


async def get_category_by_slug(db: AsyncSession, slug: str) -> Category | None:
    return await db.scalar(select(Category).where(Category.slug == slug, Category.is_active))


async def list_brands(db: AsyncSession) -> list[Brand]:
    stmt = select(Brand).where(Brand.is_active).order_by(Brand.name)
    return list((await db.scalars(stmt)).all())


async def get_brand_by_slug(db: AsyncSession, slug: str) -> Brand | None:
    return await db.scalar(select(Brand).where(Brand.slug == slug, Brand.is_active))


async def facets(db: AsyncSession, f: ProductFilters, category_ids: list[uuid.UUID] | None) -> dict:
    base = apply_filters(
        _published(
            select(
                Product.id,
                Product.category_id,
                Product.brand_id,
                Product.product_type,
                Product.base_price,
            )
        ),
        f,
        category_ids,
    ).subquery()

    cat_rows = await db.execute(
        select(Category.slug, Category.name, func.count(base.c.id))
        .join(base, base.c.category_id == Category.id)
        .group_by(Category.slug, Category.name)
        .order_by(Category.name)
    )
    brand_rows = await db.execute(
        select(Brand.slug, Brand.name, func.count(base.c.id))
        .join(base, base.c.brand_id == Brand.id)
        .group_by(Brand.slug, Brand.name)
        .order_by(Brand.name)
    )
    type_rows = await db.execute(
        select(base.c.product_type, func.count(base.c.id)).group_by(base.c.product_type)
    )
    price = (
        await db.execute(select(func.min(base.c.base_price), func.max(base.c.base_price)))
    ).one()

    return {
        "categories": [{"slug": s, "name": n, "count": c} for s, n, c in cat_rows],
        "brands": [{"slug": s, "name": n, "count": c} for s, n, c in brand_rows],
        "product_types": [
            {"slug": t, "name": t.replace("_", " ").title(), "count": c} for t, c in type_rows
        ],
        "price_min": Decimal(price[0]) if price[0] is not None else None,
        "price_max": Decimal(price[1]) if price[1] is not None else None,
    }

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import Category, Product
from app.modules.vendors.models import Vendor


async def category_tree(
    db: AsyncSession,
) -> dict[uuid.UUID, tuple[uuid.UUID | None, Decimal | None]]:
    """id → (parent_id, own rate) for every category; small enough to load whole."""
    rows = await db.execute(select(Category.id, Category.parent_id, Category.commission_rate))
    return {cid: (parent, rate) for cid, parent, rate in rows}


async def categories(db: AsyncSession) -> list[tuple[Category, int]]:
    counts = (
        select(Product.category_id, func.count(Product.id).label("n"))
        .group_by(Product.category_id)
        .subquery()
    )
    rows = await db.execute(
        select(Category, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.category_id == Category.id)
        .order_by(Category.sort_order, Category.name)
    )
    return [(c, n) for c, n in rows]


async def vendors(db: AsyncSession) -> list[Vendor]:
    return list((await db.scalars(select(Vendor).order_by(Vendor.name))).all())

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.catalog.models import Product, ProductVariant
from app.modules.orders.models import Order


async def get_variants_for_update(
    db: AsyncSession, variant_ids: list[uuid.UUID]
) -> dict[uuid.UUID, ProductVariant]:
    """Lock the requested variant rows FOR UPDATE so concurrent checkouts can't
    oversell the same stock. `OF ProductVariant` keeps the lock on the variant
    rows only; the product + its images are loaded separately (selectin) so the
    service can read them without triggering an async lazy-load."""
    stmt = (
        select(ProductVariant)
        .where(ProductVariant.id.in_(variant_ids))
        .with_for_update(of=ProductVariant)
        .options(selectinload(ProductVariant.product).selectinload(Product.images))
    )
    rows = (await db.scalars(stmt)).all()
    return {v.id: v for v in rows}


async def next_order_number(db: AsyncSession) -> str:
    # BC-YYYY-NNNNN, sequential-ish by count. Uniqueness enforced by the column.
    count = await db.scalar(select(func.count()).select_from(Order)) or 0
    from datetime import UTC, datetime

    year = datetime.now(UTC).year
    return f"BC-{year}-{count + 1:05d}"


async def list_orders_for_user(
    db: AsyncSession, user_id: uuid.UUID, offset: int, limit: int
) -> tuple[list[Order], int]:
    base = select(Order).where(Order.user_id == user_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    stmt = base.order_by(Order.created_at.desc()).offset(offset).limit(limit)
    rows = (await db.scalars(stmt)).unique().all()
    return list(rows), total


async def get_order_for_user(
    db: AsyncSession, order_id: uuid.UUID, user_id: uuid.UUID
) -> Order | None:
    return await db.scalar(select(Order).where(Order.id == order_id, Order.user_id == user_id))

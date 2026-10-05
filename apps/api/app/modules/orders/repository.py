import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.catalog.models import Product, ProductVariant
from app.modules.orders.models import Order, VendorOrder


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


async def order_totals_by_status(
    db: AsyncSession, start: datetime, end: datetime
) -> dict[str, tuple[int, Decimal]]:
    """`{status: (order_count, sum_of_totals)}` for orders created in [start, end)."""
    stmt = (
        select(Order.status, func.count(Order.id), func.coalesce(func.sum(Order.total), 0))
        .where(Order.created_at >= start, Order.created_at < end)
        .group_by(Order.status)
    )
    return {status: (count, Decimal(total)) for status, count, total in (await db.execute(stmt))}


# --- Vendor-scoped access -----------------------------------------------------
# A vendor reaches order data only through these, always filtered by vendor_id:
# another vendor's sub-order (or the platform's) is simply not found.


async def list_vendor_orders(
    db: AsyncSession, vendor_id: uuid.UUID, status: str | None, offset: int, limit: int
) -> tuple[list[VendorOrder], int]:
    stmt = select(VendorOrder).where(VendorOrder.vendor_id == vendor_id)
    if status:
        stmt = stmt.where(VendorOrder.status == status)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(
        stmt.options(selectinload(VendorOrder.order))
        .order_by(VendorOrder.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(rows.unique().all()), total


async def get_vendor_order(
    db: AsyncSession, vendor_id: uuid.UUID, vendor_order_id: uuid.UUID, *, for_update: bool = False
) -> VendorOrder | None:
    stmt = (
        select(VendorOrder)
        .where(VendorOrder.id == vendor_order_id, VendorOrder.vendor_id == vendor_id)
        # Status changes read the sibling sub-orders (sync_parent_status); load them
        # here — a lazy load inside async code raises MissingGreenlet.
        .options(selectinload(VendorOrder.order).selectinload(Order.vendor_orders))
    )
    if for_update:
        stmt = stmt.with_for_update(of=VendorOrder)
    return (await db.scalars(stmt)).unique().first()


async def get_order_for_update(db: AsyncSession, order_id: uuid.UUID) -> Order | None:
    return await db.scalar(select(Order).where(Order.id == order_id).with_for_update())


async def user_email(db: AsyncSession, user_id: uuid.UUID | None) -> str | None:
    from app.modules.users.models import User

    if user_id is None:
        return None
    return await db.scalar(select(User.email).where(User.id == user_id))

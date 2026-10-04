import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import Product
from app.modules.orders.models import VendorOrder
from app.modules.vendors.models import Vendor
from app.shared.enums import VendorOrderStatus, VendorStatus


async def get_by_owner(db: AsyncSession, owner_id: uuid.UUID) -> Vendor | None:
    return await db.scalar(select(Vendor).where(Vendor.owner_id == owner_id))


async def get_approved_by_slug(db: AsyncSession, slug: str) -> Vendor | None:
    return await db.scalar(
        select(Vendor).where(Vendor.slug == slug, Vendor.status == VendorStatus.APPROVED)
    )


async def list_vendors(
    db: AsyncSession, status: str | None, q: str | None, offset: int, limit: int
) -> tuple[list[Vendor], int]:
    stmt = select(Vendor)
    if status:
        stmt = stmt.where(Vendor.status == status)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Vendor.name.ilike(pattern), Vendor.contact_email.ilike(pattern)))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(stmt.order_by(Vendor.created_at.desc()).offset(offset).limit(limit))
    return list(rows.all()), total


async def product_counts(db: AsyncSession, vendor_id: uuid.UUID) -> dict[str, int]:
    rows = await db.execute(
        select(Product.status, func.count())
        .where(Product.vendor_id == vendor_id)
        .group_by(Product.status)
    )
    return {status: n for status, n in rows}


async def orders_to_ship(db: AsyncSession, vendor_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(VendorOrder)
            .where(
                VendorOrder.vendor_id == vendor_id,
                VendorOrder.status == VendorOrderStatus.PROCESSING,
            )
        )
        or 0
    )

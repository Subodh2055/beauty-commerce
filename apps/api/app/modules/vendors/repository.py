import uuid
from datetime import date, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import Product, ProductImage, ProductVariant
from app.modules.orders.models import OrderItem, VendorOrder
from app.modules.reviews.models import Review
from app.modules.vendors.models import Vendor
from app.shared.enums import ProductStatus, VendorOrderStatus, VendorStatus

# Sub-orders that count as a sale in the portal's reports (paid / accepted onwards).
SOLD = (
    VendorOrderStatus.PROCESSING,
    VendorOrderStatus.PACKED,
    VendorOrderStatus.SHIPPED,
    VendorOrderStatus.DELIVERED,
)
# Reports bucket by the shop's local day, not UTC.
REPORT_TZ = "Asia/Kathmandu"


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
                VendorOrder.status.in_([VendorOrderStatus.PROCESSING, VendorOrderStatus.PACKED]),
            )
        )
        or 0
    )


# --- Portal reports -------------------------------------------------------------
# Every query below filters on `vendor_id`; callers pass the vendor resolved from
# the session (dependencies.current_vendor), never an id from the request.


def _local_day(col):
    return func.date(func.timezone(REPORT_TZ, col))


async def daily_sales(
    db: AsyncSession, vendor_id: uuid.UUID, since: datetime, until: datetime
) -> list[tuple[date, object, object, int]]:
    """(day, gross subtotal, vendor earnings, sub-order count) per local day."""
    day = _local_day(VendorOrder.created_at)
    rows = await db.execute(
        select(
            day,
            func.sum(VendorOrder.subtotal),
            func.sum(VendorOrder.vendor_earnings),
            func.count(VendorOrder.id),
        )
        .where(
            VendorOrder.vendor_id == vendor_id,
            VendorOrder.status.in_(SOLD),
            VendorOrder.created_at >= since,
            VendorOrder.created_at < until,
        )
        .group_by(day)
    )
    return [tuple(r) for r in rows]


async def daily_units(
    db: AsyncSession, vendor_id: uuid.UUID, since: datetime, until: datetime
) -> dict[date, int]:
    day = _local_day(VendorOrder.created_at)
    rows = await db.execute(
        select(day, func.sum(OrderItem.quantity))
        .join(VendorOrder, VendorOrder.id == OrderItem.vendor_order_id)
        .where(
            VendorOrder.vendor_id == vendor_id,
            VendorOrder.status.in_(SOLD),
            VendorOrder.created_at >= since,
            VendorOrder.created_at < until,
        )
        .group_by(day)
    )
    return {d: int(n) for d, n in rows}


async def top_products(
    db: AsyncSession, vendor_id: uuid.UUID, since: datetime, limit: int = 5
) -> list[tuple]:
    """(product_id, name, slug, units, revenue, image_url), best sellers first."""
    units = func.sum(OrderItem.quantity).label("units")
    cover = (
        select(ProductImage.url)
        .where(ProductImage.product_id == OrderItem.product_id)
        .order_by(ProductImage.is_primary.desc(), ProductImage.sort_order)
        .limit(1)
        .correlate(OrderItem)
        .scalar_subquery()
    )
    rows = await db.execute(
        select(
            OrderItem.product_id,
            func.max(OrderItem.product_name),
            func.max(OrderItem.slug),
            units,
            func.sum(OrderItem.line_total),
            func.max(cover),
        )
        .join(VendorOrder, VendorOrder.id == OrderItem.vendor_order_id)
        .where(
            VendorOrder.vendor_id == vendor_id,
            VendorOrder.status.in_(SOLD),
            VendorOrder.created_at >= since,
            OrderItem.product_id.isnot(None),
        )
        .group_by(OrderItem.product_id)
        .order_by(units.desc(), func.sum(OrderItem.line_total).desc())
        .limit(limit)
    )
    return [tuple(r) for r in rows]


def _variants(vendor_id: uuid.UUID):
    return (
        select(ProductVariant, Product.name, Product.status)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(Product.vendor_id == vendor_id, Product.status != ProductStatus.ARCHIVED)
    )


async def low_stock(
    db: AsyncSession, vendor_id: uuid.UUID, threshold: int, limit: int = 8
) -> list[tuple]:
    stmt = (
        _variants(vendor_id)
        .where(ProductVariant.stock_quantity <= threshold)
        .order_by(ProductVariant.stock_quantity, Product.name)
        .limit(limit)
    )
    return [tuple(r) for r in await db.execute(stmt)]


async def list_inventory(
    db: AsyncSession,
    vendor_id: uuid.UUID,
    q: str | None,
    low_only: bool,
    threshold: int,
    offset: int,
    limit: int,
) -> tuple[list[tuple], int]:
    stmt = _variants(vendor_id)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(pattern),
                ProductVariant.sku.ilike(pattern),
                ProductVariant.name.ilike(pattern),
            )
        )
    if low_only:
        stmt = stmt.where(ProductVariant.stock_quantity <= threshold)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.execute(
        stmt.order_by(ProductVariant.stock_quantity, Product.name, ProductVariant.sort_order)
        .offset(offset)
        .limit(limit)
    )
    return [tuple(r) for r in rows], total


def _reviews(vendor_id: uuid.UUID):
    return (
        select(Review, Product.name, Product.slug)
        .join(Product, Product.id == Review.product_id)
        .where(Product.vendor_id == vendor_id)
    )


async def list_reviews(
    db: AsyncSession, vendor_id: uuid.UUID, rating: int | None, offset: int, limit: int
) -> tuple[list[tuple], int]:
    stmt = _reviews(vendor_id)
    if rating:
        stmt = stmt.where(Review.rating == rating)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.execute(stmt.order_by(Review.created_at.desc()).offset(offset).limit(limit))
    return [tuple(r) for r in rows], total


async def review_breakdown(db: AsyncSession, vendor_id: uuid.UUID) -> dict[int, int]:
    rows = await db.execute(
        select(Review.rating, func.count())
        .join(Product, Product.id == Review.product_id)
        .where(Product.vendor_id == vendor_id)
        .group_by(Review.rating)
    )
    return {int(r): int(n) for r, n in rows}

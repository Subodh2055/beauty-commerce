"""Platform-wide sales queries. Days are UTC calendar days of `created_at`
(the beat schedule runs in UTC too)."""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import Date, cast, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.models import AnalyticsDaily
from app.modules.orders.models import Order, OrderItem, VendorOrder
from app.modules.returns.models import Refund
from app.modules.users.models import User
from app.modules.vendors.models import Vendor
from app.shared.enums import OrderStatus

# An order counts as a sale once paid (or COD accepted) and until refunded.
SALE_STATUSES = (
    OrderStatus.PAID,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
)


@dataclass
class DayStats:
    orders: int = 0
    revenue: Decimal = Decimal("0")
    units: int = 0
    new_customers: int = 0
    refunds: Decimal = Decimal("0")
    by_status: dict[str, list] = field(default_factory=dict)


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """[start 00:00, end+1 00:00) in UTC."""
    return (
        datetime.combine(start, time.min, tzinfo=UTC),
        datetime.combine(end + timedelta(days=1), time.min, tzinfo=UTC),
    )


def _day(column):
    return cast(func.timezone("UTC", column), Date)


async def live_days(db: AsyncSession, start: date, end: date) -> dict[date, DayStats]:
    """Per-day figures for [start, end], computed from the source tables."""
    lo, hi = _bounds(start, end)
    out: dict[date, DayStats] = {}

    def at(d: date) -> DayStats:
        return out.setdefault(d, DayStats())

    day = _day(Order.created_at)
    for d, status, n, value in await db.execute(
        select(day, Order.status, func.count(Order.id), func.coalesce(func.sum(Order.total), 0))
        .where(Order.created_at >= lo, Order.created_at < hi)
        .group_by(day, Order.status)
    ):
        s = at(d)
        s.by_status[status] = [n, str(value)]
        if status in SALE_STATUSES:
            s.orders += n
            s.revenue += Decimal(value)

    for d, units in await db.execute(
        select(day, func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.created_at >= lo, Order.created_at < hi, Order.status.in_(SALE_STATUSES))
        .group_by(day)
    ):
        at(d).units = int(units)

    user_day = _day(User.created_at)
    for d, n in await db.execute(
        select(user_day, func.count(User.id))
        .where(User.created_at >= lo, User.created_at < hi)
        .group_by(user_day)
    ):
        at(d).new_customers = n

    refund_day = _day(Refund.created_at)
    for d, amount in await db.execute(
        select(refund_day, func.coalesce(func.sum(Refund.amount), 0))
        .where(Refund.created_at >= lo, Refund.created_at < hi)
        .group_by(refund_day)
    ):
        at(d).refunds = Decimal(amount)
    return out


async def rolled_up(db: AsyncSession, start: date, end: date) -> dict[date, AnalyticsDaily]:
    rows = await db.scalars(
        select(AnalyticsDaily).where(AnalyticsDaily.day >= start, AnalyticsDaily.day <= end)
    )
    return {r.day: r for r in rows}


async def missing_days(db: AsyncSession, start: date, end: date) -> list[date]:
    have = set(
        await db.scalars(
            select(AnalyticsDaily.day).where(AnalyticsDaily.day >= start, AnalyticsDaily.day <= end)
        )
    )
    n = (end - start).days + 1
    return [d for d in (start + timedelta(days=i) for i in range(n)) if d not in have]


async def upsert_day(db: AsyncSession, day: date, s: DayStats) -> None:
    values = {
        "day": day,
        "orders_count": s.orders,
        "revenue": s.revenue,
        "units": s.units,
        "new_customers": s.new_customers,
        "refunds": s.refunds,
        "by_status": s.by_status,
        "computed_at": datetime.now(UTC),
    }
    stmt = insert(AnalyticsDaily).values(**values)
    await db.execute(
        stmt.on_conflict_do_update(
            index_elements=[AnalyticsDaily.day],
            set_={k: stmt.excluded[k] for k in values if k != "day"},
        )
    )


async def by_status(db: AsyncSession, start: date, end: date) -> list[tuple[str, int, Decimal]]:
    lo, hi = _bounds(start, end)
    rows = await db.execute(
        select(Order.status, func.count(Order.id), func.coalesce(func.sum(Order.total), 0))
        .where(Order.created_at >= lo, Order.created_at < hi)
        .group_by(Order.status)
        .order_by(func.count(Order.id).desc())
    )
    return [(s, n, Decimal(v)) for s, n, v in rows]


async def top_products(
    db: AsyncSession, start: date, end: date, limit: int = 8
) -> list[tuple[str, int, int, Decimal]]:
    lo, hi = _bounds(start, end)
    rows = await db.execute(
        select(
            OrderItem.product_name,
            func.sum(OrderItem.quantity),
            func.count(func.distinct(OrderItem.order_id)),
            func.sum(OrderItem.line_total),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.created_at >= lo, Order.created_at < hi, Order.status.in_(SALE_STATUSES))
        .group_by(OrderItem.product_name)
        .order_by(func.sum(OrderItem.line_total).desc())
        .limit(limit)
    )
    return [(name, int(u), n, Decimal(v)) for name, u, n, v in rows]


async def top_vendors(
    db: AsyncSession, start: date, end: date, limit: int = 8
) -> list[tuple[str, int, Decimal, Decimal]]:
    lo, hi = _bounds(start, end)
    name = func.coalesce(Vendor.name, "Platform")
    rows = await db.execute(
        select(
            name,
            func.count(VendorOrder.id),
            func.sum(VendorOrder.subtotal),
            func.sum(VendorOrder.commission_amount),
        )
        .join(Order, Order.id == VendorOrder.order_id)
        .outerjoin(Vendor, Vendor.id == VendorOrder.vendor_id)
        .where(Order.created_at >= lo, Order.created_at < hi, Order.status.in_(SALE_STATUSES))
        .group_by(name)
        .order_by(func.sum(VendorOrder.subtotal).desc())
        .limit(limit)
    )
    return [(n, c, Decimal(rev), Decimal(com or 0)) for n, c, rev, com in rows]


async def payment_methods(
    db: AsyncSession, start: date, end: date
) -> list[tuple[str, int, Decimal]]:
    lo, hi = _bounds(start, end)
    rows = await db.execute(
        select(Order.payment_method, func.count(Order.id), func.sum(Order.total))
        .where(Order.created_at >= lo, Order.created_at < hi, Order.status.in_(SALE_STATUSES))
        .group_by(Order.payment_method)
        .order_by(func.count(Order.id).desc())
    )
    return [(m, n, Decimal(v)) for m, n, v in rows]

import uuid
from decimal import Decimal

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.orders.models import Order, VendorOrder
from app.modules.payouts.models import Payout
from app.modules.vendors.models import Vendor
from app.shared.enums import PaymentStatus, PayoutStatus, VendorOrderStatus


def _eligible() -> Select:
    """Sub-orders whose earnings can be paid out: a vendor's, delivered, the
    customer's payment collected, and not already in a payout."""
    return (
        select(VendorOrder)
        .join(Order, Order.id == VendorOrder.order_id)
        .where(
            VendorOrder.vendor_id.isnot(None),
            VendorOrder.status == VendorOrderStatus.DELIVERED,
            VendorOrder.payout_id.is_(None),
            Order.payment_status == PaymentStatus.PAID,
        )
    )


async def balances(db: AsyncSession) -> list[tuple[uuid.UUID, str, int, Decimal, Decimal, Decimal]]:
    eligible = _eligible().subquery()
    stmt = (
        select(
            Vendor.id,
            Vendor.name,
            func.count(eligible.c.id),
            func.sum(eligible.c.subtotal),
            func.sum(eligible.c.commission_amount),
            func.sum(eligible.c.vendor_earnings),
        )
        .join(eligible, eligible.c.vendor_id == Vendor.id)
        .group_by(Vendor.id, Vendor.name)
        .order_by(func.sum(eligible.c.vendor_earnings).desc())
    )
    return [tuple(r) for r in await db.execute(stmt)]


async def lock_eligible_for_vendor(db: AsyncSession, vendor_id: uuid.UUID) -> list[VendorOrder]:
    stmt = (
        _eligible()
        .where(VendorOrder.vendor_id == vendor_id)
        .with_for_update(of=VendorOrder)
        .options(selectinload(VendorOrder.order))
        .order_by(VendorOrder.delivered_at)
    )
    return list((await db.scalars(stmt)).unique().all())


async def lines(db: AsyncSession, payout_id: uuid.UUID) -> list[VendorOrder]:
    stmt = (
        select(VendorOrder)
        .where(VendorOrder.payout_id == payout_id)
        .options(selectinload(VendorOrder.order))
        .order_by(VendorOrder.delivered_at)
    )
    return list((await db.scalars(stmt)).unique().all())


async def list_payouts(
    db: AsyncSession,
    *,
    vendor_id: uuid.UUID | None,
    status: str | None,
    offset: int,
    limit: int,
) -> tuple[list[Payout], int]:
    stmt = select(Payout)
    if vendor_id is not None:
        stmt = stmt.where(Payout.vendor_id == vendor_id)
    if status:
        stmt = stmt.where(Payout.status == status)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(stmt.order_by(Payout.created_at.desc()).offset(offset).limit(limit))
    return list(rows.all()), total


async def get_for_vendor(
    db: AsyncSession, vendor_id: uuid.UUID, payout_id: uuid.UUID
) -> Payout | None:
    """Vendor-scoped: another vendor's payout is not found."""
    return await db.scalar(
        select(Payout).where(Payout.id == payout_id, Payout.vendor_id == vendor_id)
    )


async def earnings_totals(db: AsyncSession, vendor_id: uuid.UUID) -> dict[str, Decimal]:
    def total(stmt) -> Select:
        return select(func.coalesce(func.sum(stmt.c.vendor_earnings), 0))

    eligible = _eligible().where(VendorOrder.vendor_id == vendor_id).subquery()
    in_progress = (
        select(VendorOrder.vendor_earnings)
        .join(Order, Order.id == VendorOrder.order_id)
        .where(
            VendorOrder.vendor_id == vendor_id,
            VendorOrder.payout_id.is_(None),
            VendorOrder.status.in_(
                [
                    VendorOrderStatus.PENDING,
                    VendorOrderStatus.PROCESSING,
                    VendorOrderStatus.SHIPPED,
                    VendorOrderStatus.DELIVERED,
                ]
            ),
        )
        .where(
            (VendorOrder.status != VendorOrderStatus.DELIVERED)
            | (Order.payment_status != PaymentStatus.PAID)
        )
        .subquery()
    )

    async def payouts_sum(status: str) -> Decimal:
        return Decimal(
            await db.scalar(
                select(func.coalesce(func.sum(Payout.net_amount), 0)).where(
                    Payout.vendor_id == vendor_id, Payout.status == status
                )
            )
        )

    return {
        "ready_for_payout": Decimal(await db.scalar(total(eligible))),
        "in_progress": Decimal(await db.scalar(total(in_progress))),
        "in_pending_payouts": await payouts_sum(PayoutStatus.PENDING),
        "paid_out": await payouts_sum(PayoutStatus.PAID),
    }

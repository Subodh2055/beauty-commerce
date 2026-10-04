"""Vendor payouts.

A payout bundles a vendor's eligible sub-orders (delivered, paid, not yet paid
out). Amounts are summed from each sub-order's checkout-time snapshot:
    gross = Σ subtotal, commission = Σ commission_amount, net = Σ vendor_earnings
Generating locks those rows and links them to the payout in one transaction,
so concurrent runs can't pay the same sale twice.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationFailedError
from app.modules.payouts import repository as repo
from app.modules.payouts.models import Payout
from app.modules.payouts.schemas import (
    EarningsSummary,
    PayoutDetail,
    PayoutLine,
    PayoutOut,
    VendorBalance,
)
from app.modules.settings import service as settings_service
from app.modules.vendors.models import Vendor
from app.shared.enums import PayoutStatus
from app.shared.pagination import Page, PageParams


async def _detail(db: AsyncSession, payout: Payout) -> PayoutDetail:
    rows = await repo.lines(db, payout.id)
    return PayoutDetail(
        **PayoutOut.model_validate(payout).model_dump(),
        lines=[
            PayoutLine(
                vendor_order_id=vo.id,
                order_number=vo.order.order_number,
                delivered_at=vo.delivered_at,
                subtotal=vo.subtotal,
                commission_rate=vo.commission_rate,
                commission_amount=vo.commission_amount,
                vendor_earnings=vo.vendor_earnings,
            )
            for vo in rows
        ],
    )


async def balances(db: AsyncSession) -> list[VendorBalance]:
    return [
        VendorBalance(
            vendor_id=vid,
            vendor_name=name,
            eligible_orders=n,
            gross_amount=Decimal(gross),
            commission_amount=Decimal(commission),
            net_amount=Decimal(net),
        )
        for vid, name, n, gross, commission, net in await repo.balances(db)
    ]


async def generate(
    db: AsyncSession, vendor_id: uuid.UUID, created_by: uuid.UUID, note: str | None
) -> PayoutDetail:
    if await db.get(Vendor, vendor_id) is None:
        raise NotFoundError("Vendor not found")
    eligible = await repo.lock_eligible_for_vendor(db, vendor_id)
    if not eligible:
        raise ValidationFailedError("This vendor has nothing ready to pay out")
    net = sum((vo.vendor_earnings for vo in eligible), Decimal("0"))
    minimum = (await settings_service.get_settings(db)).min_payout_amount
    if net < minimum:
        raise ValidationFailedError(f"Balance {net} is below the minimum payout of {minimum}")

    payout = Payout(
        id=uuid.uuid4(),
        vendor_id=vendor_id,
        status=PayoutStatus.PENDING,
        currency=eligible[0].order.currency,
        gross_amount=sum((vo.subtotal for vo in eligible), Decimal("0")),
        commission_amount=sum((vo.commission_amount for vo in eligible), Decimal("0")),
        net_amount=net,
        order_count=len(eligible),
        created_by=created_by,
        note=note,
    )
    db.add(payout)
    for vo in eligible:
        vo.payout_id = payout.id
    await db.commit()
    return await _detail(db, payout)


async def _get(db: AsyncSession, payout_id: uuid.UUID) -> Payout:
    payout = await db.get(Payout, payout_id, with_for_update=True)
    if payout is None:
        raise NotFoundError("Payout not found")
    return payout


async def mark_paid(db: AsyncSession, payout_id: uuid.UUID, reference: str) -> PayoutDetail:
    payout = await _get(db, payout_id)
    if payout.status != PayoutStatus.PENDING:
        raise ValidationFailedError(f"A {payout.status} payout can't be marked paid")
    payout.status = PayoutStatus.PAID
    payout.paid_at = datetime.now(UTC)
    payout.reference = reference
    await db.commit()
    return await _detail(db, payout)


async def cancel(db: AsyncSession, payout_id: uuid.UUID) -> PayoutDetail:
    """Void a payout that hasn't been sent; its sub-orders become eligible again."""
    payout = await _get(db, payout_id)
    if payout.status != PayoutStatus.PENDING:
        raise ValidationFailedError(f"A {payout.status} payout can't be cancelled")
    for vo in await repo.lines(db, payout.id):
        vo.payout_id = None
    payout.status = PayoutStatus.CANCELLED
    await db.commit()
    return await _detail(db, payout)


async def list_payouts(
    db: AsyncSession, page: PageParams, *, vendor_id: uuid.UUID | None, status: str | None
) -> Page[PayoutOut]:
    rows, total = await repo.list_payouts(
        db, vendor_id=vendor_id, status=status, offset=page.offset, limit=page.size
    )
    return Page(
        items=[PayoutOut.model_validate(p) for p in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


async def get_payout(db: AsyncSession, payout_id: uuid.UUID) -> PayoutDetail:
    payout = await db.get(Payout, payout_id)
    if payout is None:
        raise NotFoundError("Payout not found")
    return await _detail(db, payout)


# --- Vendor portal (always scoped to the caller's vendor) ---------------------


async def get_for_vendor(
    db: AsyncSession, vendor_id: uuid.UUID, payout_id: uuid.UUID
) -> PayoutDetail:
    payout = await repo.get_for_vendor(db, vendor_id, payout_id)
    if payout is None:
        raise NotFoundError("Payout not found")
    return await _detail(db, payout)


async def earnings(db: AsyncSession, vendor_id: uuid.UUID) -> EarningsSummary:
    return EarningsSummary(**await repo.earnings_totals(db, vendor_id))

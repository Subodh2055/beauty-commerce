"""Coupon validation and redemption.

`evaluate` is the single source of truth for whether a coupon applies and how
much it's worth; both the /coupons/validate endpoint and checkout call it so the
quoted discount and the charged discount can never diverge.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationFailedError
from app.modules.coupons.models import Coupon, CouponUsage


async def _get_by_code(db: AsyncSession, code: str) -> Coupon | None:
    return await db.scalar(select(Coupon).where(Coupon.code == code.strip().upper()))


async def _user_redemptions(db: AsyncSession, coupon_id: uuid.UUID, user_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(CouponUsage)
            .where(CouponUsage.coupon_id == coupon_id, CouponUsage.user_id == user_id)
        )
        or 0
    )


async def evaluate(
    db: AsyncSession, code: str, subtotal: Decimal, user_id: uuid.UUID | None
) -> tuple[Coupon, Decimal]:
    """Return (coupon, discount) or raise ValidationFailedError with a reason."""
    coupon = await _get_by_code(db, code)
    if coupon is None or not coupon.is_active:
        raise ValidationFailedError("This coupon code is not valid")

    now = datetime.now(UTC)
    if coupon.starts_at and now < coupon.starts_at:
        raise ValidationFailedError("This coupon is not active yet")
    if coupon.ends_at and now > coupon.ends_at:
        raise ValidationFailedError("This coupon has expired")
    if subtotal < coupon.min_subtotal:
        raise ValidationFailedError(f"Spend at least {coupon.min_subtotal:.0f} to use this coupon")
    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        raise ValidationFailedError("This coupon has reached its usage limit")
    if user_id is not None:
        used = await _user_redemptions(db, coupon.id, user_id)
        if used >= coupon.per_user_limit:
            raise ValidationFailedError("You have already used this coupon")

    discount = coupon.compute_discount(subtotal)
    if discount <= 0:
        raise ValidationFailedError("This coupon has no effect on your order")
    return coupon, discount


async def redeem(
    db: AsyncSession,
    coupon: Coupon,
    user_id: uuid.UUID | None,
    order_id: uuid.UUID,
    discount: Decimal,
) -> None:
    """Record a redemption. Caller owns the transaction (checkout)."""
    coupon.used_count += 1
    db.add(
        CouponUsage(
            coupon_id=coupon.id,
            user_id=user_id,
            order_id=order_id,
            discount_amount=discount,
            created_at=datetime.now(UTC),
        )
    )

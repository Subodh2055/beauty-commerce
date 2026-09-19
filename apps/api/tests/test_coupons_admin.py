"""Coupon math + admin transition-map tests (no DB needed)."""

from decimal import Decimal

from app.modules.admin.service import RESTOCK_STATUSES, TRANSITIONS
from app.modules.coupons.models import Coupon
from app.shared.enums import DiscountType, OrderStatus


def _coupon(**kw) -> Coupon:
    defaults = dict(
        code="X",
        discount_type=DiscountType.PERCENT,
        value=Decimal("10"),
        min_subtotal=Decimal("0"),
        max_discount=None,
    )
    defaults.update(kw)
    return Coupon(**defaults)


def test_percent_discount() -> None:
    assert _coupon(value=Decimal("10")).compute_discount(Decimal("1000")) == Decimal("100.00")


def test_fixed_discount() -> None:
    c = _coupon(discount_type=DiscountType.FIXED, value=Decimal("250"))
    assert c.compute_discount(Decimal("1000")) == Decimal("250.00")


def test_max_discount_cap() -> None:
    c = _coupon(value=Decimal("50"), max_discount=Decimal("300"))
    assert c.compute_discount(Decimal("1000")) == Decimal("300.00")


def test_discount_never_exceeds_subtotal() -> None:
    c = _coupon(discount_type=DiscountType.FIXED, value=Decimal("5000"))
    assert c.compute_discount(Decimal("1000")) == Decimal("1000.00")


def test_delivered_is_terminal_except_refund() -> None:
    assert TRANSITIONS[OrderStatus.DELIVERED] == {OrderStatus.REFUNDED}
    assert OrderStatus.PROCESSING not in TRANSITIONS.get(OrderStatus.DELIVERED, set())


def test_cancel_and_refund_restock() -> None:
    assert OrderStatus.CANCELLED in RESTOCK_STATUSES
    assert OrderStatus.REFUNDED in RESTOCK_STATUSES
    assert OrderStatus.SHIPPED not in RESTOCK_STATUSES


def test_processing_can_ship_or_cancel() -> None:
    assert OrderStatus.SHIPPED in TRANSITIONS[OrderStatus.PROCESSING]
    assert OrderStatus.CANCELLED in TRANSITIONS[OrderStatus.PROCESSING]

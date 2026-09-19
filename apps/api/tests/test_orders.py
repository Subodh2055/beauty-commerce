"""Order schema + payment-interface tests (no DB needed)."""

import uuid
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.integrations.payments import PaymentNotConfiguredError, initiate_payment
from app.modules.orders.models import CANCELLABLE
from app.modules.orders.schemas import CheckoutIn
from app.shared.enums import OrderStatus, PaymentMethod, PaymentStatus


def _address() -> dict:
    return {"recipient_name": "A", "phone": "9800000000", "line1": "X", "city": "KTM"}


def test_checkout_requires_at_least_one_item() -> None:
    with pytest.raises(ValidationError):
        CheckoutIn(items=[], shipping_address=_address())


def test_checkout_quantity_bounds() -> None:
    vid = str(uuid.uuid4())
    with pytest.raises(ValidationError):
        CheckoutIn(items=[{"variant_id": vid, "quantity": 0}], shipping_address=_address())
    with pytest.raises(ValidationError):
        CheckoutIn(items=[{"variant_id": vid, "quantity": 100}], shipping_address=_address())


def test_checkout_defaults_to_cod() -> None:
    body = CheckoutIn(
        items=[{"variant_id": str(uuid.uuid4()), "quantity": 1}], shipping_address=_address()
    )
    assert body.payment_method == PaymentMethod.COD


def test_cod_payment_is_pending_with_ref() -> None:
    res = initiate_payment(PaymentMethod.COD, "BC-2026-00001", Decimal("100"), "NPR")
    assert res.status == PaymentStatus.PENDING
    assert res.provider_ref == "COD-BC-2026-00001"
    assert res.redirect_url is None


def test_online_payment_not_configured() -> None:
    for method in (PaymentMethod.ESEWA, PaymentMethod.KHALTI, PaymentMethod.STRIPE):
        with pytest.raises(PaymentNotConfiguredError):
            initiate_payment(method, "BC-2026-00001", Decimal("100"), "NPR")


def test_only_open_orders_are_cancellable() -> None:
    assert OrderStatus.PENDING_PAYMENT in CANCELLABLE
    assert OrderStatus.PROCESSING in CANCELLABLE
    assert OrderStatus.SHIPPED not in CANCELLABLE
    assert OrderStatus.DELIVERED not in CANCELLABLE

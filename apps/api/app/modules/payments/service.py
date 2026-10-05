"""Apply verified provider callbacks to payments and orders.

One transaction per callback: record the event (UNIQUE provider+event_id makes a
retried callback a no-op), lock the payment, check the amount, then move the
payment, the order and its vendor sub-orders together.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.integrations.payments import StubGateway, is_available, provider_by_name, stub_signature
from app.modules.notifications import service as notifications_service
from app.modules.orders import repository as orders_repo
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order, OrderStatusHistory
from app.modules.payments import repository as repo
from app.modules.payments.schemas import (
    CallbackAck,
    PaymentMethodOut,
    StubPaymentIn,
    StubPaymentOut,
    StubPaymentResult,
)
from app.shared.enums import OrderStatus, PaymentMethod, PaymentStatus

log = get_logger(__name__)

_METHOD_COPY: dict[PaymentMethod, tuple[str, str]] = {
    PaymentMethod.COD: ("Cash on Delivery", "Pay in cash when your order arrives."),
    PaymentMethod.ESEWA: ("eSewa", "Pay from your eSewa wallet."),
    PaymentMethod.KHALTI: ("Khalti", "Pay from your Khalti wallet."),
    PaymentMethod.STRIPE: ("Card", "Visa or Mastercard, processed securely."),
}


def list_methods() -> list[PaymentMethodOut]:
    out = []
    for method, (label, description) in _METHOD_COPY.items():
        available = is_available(method)
        out.append(
            PaymentMethodOut(
                method=method,
                label=label,
                description=description if available else "Coming soon",
                available=available,
                online=method != PaymentMethod.COD,
            )
        )
    return out


# --- Dev stub gateway ---------------------------------------------------------
# The stub's hosted page lives in the web app (/checkout/stub-pay). The browser
# can't hold the signing secret, so approving goes through here: we sign the
# callback server-side and feed it through the exact same path a real provider
# notification takes. Disabled (404) unless PAYMENT_STUB_ENABLED, which config
# refuses in production; scoped to the signed-in owner of the order.


async def _stub_payment(db: AsyncSession, provider_ref: str, user_id: uuid.UUID):
    found = (
        await repo.get_user_payment(db, provider_ref, user_id)
        if settings.payment_stub_enabled
        else None
    )
    if found is None:
        raise NotFoundError("Payment not found")
    return found


async def get_stub_payment(
    db: AsyncSession, provider_ref: str, user_id: uuid.UUID
) -> StubPaymentOut:
    payment, order = await _stub_payment(db, provider_ref, user_id)
    return StubPaymentOut(
        provider_ref=provider_ref,
        order_id=order.id,
        order_number=order.order_number,
        amount=payment.amount,
        currency=payment.currency,
        status=payment.status,
    )


async def complete_stub_payment(
    db: AsyncSession, body: StubPaymentIn, user_id: uuid.UUID
) -> StubPaymentResult:
    payment, order = await _stub_payment(db, body.provider_ref, user_id)
    order_id, amount = order.id, Decimal(payment.amount)
    event_id = f"stub-{uuid.uuid4().hex}"
    status = "succeeded" if body.succeeded else "failed"
    payload = {
        "event_id": event_id,
        "provider_ref": body.provider_ref,
        "status": status,
        "amount": f"{amount:.2f}",
    }
    signature = stub_signature(event_id, body.provider_ref, status, amount)
    ack = await handle_callback(db, StubGateway.name, payload, signature)
    return StubPaymentResult(order_id=order_id, outcome=ack.outcome)


async def handle_callback(
    db: AsyncSession, provider_name: str, payload: dict[str, Any], signature: str | None
) -> CallbackAck:
    provider = provider_by_name(provider_name)
    if provider is None:
        raise NotFoundError("Unknown payment provider")
    result = provider.parse_callback(payload, signature)  # raises on a bad signature

    kind = "payment.succeeded" if result.succeeded else "payment.failed"
    event_pk = await repo.record_event(
        db, provider=provider.name, event_id=result.event_id, kind=kind, payload=result.raw
    )
    if event_pk is None:
        return CallbackAck(outcome="duplicate")  # nothing was written

    payment = await repo.get_payment_for_update(db, result.provider_ref)
    if payment is None:
        await repo.set_outcome(db, event_pk, "unknown_payment", None)
        await db.commit()
        log.warning("payment_callback_unknown_ref", provider_ref=result.provider_ref)
        return CallbackAck(outcome="unknown_payment")

    if payment.status != PaymentStatus.PENDING:
        await repo.set_outcome(db, event_pk, "already_settled", payment.id)
        await db.commit()
        return CallbackAck(outcome="already_settled")

    if result.succeeded and Decimal(result.amount) != Decimal(payment.amount):
        # Never mark an order paid for the wrong amount; leave it for a human.
        await repo.set_outcome(db, event_pk, "amount_mismatch", payment.id)
        await db.commit()
        log.warning(
            "payment_amount_mismatch",
            provider_ref=result.provider_ref,
            expected=str(payment.amount),
            received=str(result.amount),
        )
        return CallbackAck(outcome="amount_mismatch")

    order = await db.get(Order, payment.order_id, with_for_update=True)
    now = datetime.now(UTC)
    if result.succeeded:
        payment.status = PaymentStatus.PAID
        order.payment_status = PaymentStatus.PAID
        if order.status == OrderStatus.PENDING_PAYMENT:
            order.status = OrderStatus.PROCESSING
        orders_service.apply_status_to_vendor_orders(order, OrderStatus.PROCESSING)
        note = "Payment received"
    else:
        payment.status = PaymentStatus.FAILED
        order.payment_status = PaymentStatus.FAILED
        if order.status == OrderStatus.PENDING_PAYMENT:
            order.status = OrderStatus.PAYMENT_FAILED
            orders_service.apply_status_to_vendor_orders(order, OrderStatus.PAYMENT_FAILED)
            await orders_service.restock_order(db, order, note="Payment failed")
        note = "Payment failed"
    order.history.append(OrderStatusHistory(status=order.status, note=note, created_at=now))
    await repo.set_outcome(db, event_pk, "applied", payment.id)
    await db.commit()

    email = await orders_repo.user_email(db, order.user_id)
    await notifications_service.order_status_changed(db, order, email)
    return CallbackAck(outcome="applied")

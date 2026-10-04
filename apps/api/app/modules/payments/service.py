"""Apply verified provider callbacks to payments and orders.

One transaction per callback: record the event (UNIQUE provider+event_id makes a
retried callback a no-op), lock the payment, check the amount, then move the
payment, the order and its vendor sub-orders together.
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.integrations.payments import provider_by_name
from app.modules.notifications import service as notifications_service
from app.modules.orders import repository as orders_repo
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order, OrderStatusHistory
from app.modules.payments import repository as repo
from app.modules.payments.schemas import CallbackAck
from app.shared.enums import OrderStatus, PaymentStatus

log = get_logger(__name__)


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

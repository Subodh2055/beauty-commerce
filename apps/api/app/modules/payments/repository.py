import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.orders.models import Order, Payment
from app.modules.payments.models import PaymentEvent


async def record_event(
    db: AsyncSession, *, provider: str, event_id: str, kind: str, payload: dict[str, Any]
) -> uuid.UUID | None:
    """Insert the event, or return None if this provider already sent it."""
    stmt = (
        insert(PaymentEvent)
        .values(
            id=uuid.uuid4(),
            provider=provider,
            event_id=event_id,
            kind=kind,
            payload=payload,
            outcome="received",
            received_at=datetime.now(UTC),
        )
        .on_conflict_do_nothing(constraint="uq_payment_events_provider_event")
        .returning(PaymentEvent.id)
    )
    return await db.scalar(stmt)


async def set_outcome(
    db: AsyncSession, event_pk: uuid.UUID, outcome: str, payment_id: uuid.UUID | None
) -> None:
    event = await db.get(PaymentEvent, event_pk)
    if event is not None:
        event.outcome = outcome
        event.payment_id = payment_id


async def get_payment_for_update(db: AsyncSession, provider_ref: str) -> Payment | None:
    return await db.scalar(
        select(Payment).where(Payment.provider_ref == provider_ref).with_for_update()
    )


async def get_user_payment(
    db: AsyncSession, provider_ref: str, user_id: uuid.UUID
) -> tuple[Payment, Order] | None:
    """A payment and its order, only if that order belongs to `user_id`."""
    row = (
        (
            await db.execute(
                select(Payment, Order)
                .join(Order, Order.id == Payment.order_id)
                .where(Payment.provider_ref == provider_ref, Order.user_id == user_id)
            )
        )
        .unique()
        .first()
    )
    return (row[0], row[1]) if row else None

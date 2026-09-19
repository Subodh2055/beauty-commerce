"""Emit order notifications: build the payload, persist an outbox row, dispatch.

`emit_order_event` is best-effort and swallows all errors — a notification must
never break the order flow. It commits its own row so a failed dispatch is still
auditable (and retryable later).
"""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.integrations import notifications as transport
from app.modules.notifications.models import Notification
from app.modules.notifications.templates import render
from app.modules.orders.models import Order
from app.shared.enums import NotificationStatus
from app.shared.pagination import Page, PageParams

log = get_logger(__name__)


def _order_payload(order: Order) -> dict:
    return {
        "order_id": str(order.id),
        "order_number": order.order_number,
        "status": order.status,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "recipient": order.ship_recipient,
        "phone": order.ship_phone,
        "total": str(order.total),
        "currency": order.currency,
        "items": [
            {
                "product_name": i.product_name,
                "variant_name": i.variant_name,
                "quantity": i.quantity,
                "line_total": str(i.line_total),
            }
            for i in order.items
        ],
    }


async def emit_order_event(
    db: AsyncSession, order: Order, event: str, recipient_email: str | None
) -> None:
    try:
        payload = _order_payload(order)
        subject, text, html = render(event, payload)

        result = await transport.dispatch(event, payload, recipient_email, subject, html, text)

        db.add(
            Notification(
                user_id=order.user_id,
                event=event,
                channel=result.channel,
                recipient=recipient_email,
                subject=subject,
                status=result.status,
                error=result.error,
                payload=payload,
                body_text=text,
                created_at=datetime.now(UTC),
            )
        )
        await db.commit()
        log.info(
            "order_notification",
            order_event=event,
            order=order.order_number,
            channel=result.channel,
            status=result.status,
        )
    except Exception as exc:  # noqa: BLE001 - notifications never break orders
        log.warning("notification_emit_failed", order_event=event, error=str(exc))
        await db.rollback()


async def list_notifications(db: AsyncSession, page: PageParams) -> Page[dict]:
    base = select(Notification)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = (
        await db.scalars(
            base.order_by(Notification.created_at.desc()).offset(page.offset).limit(page.size)
        )
    ).all()
    items = [
        {
            "id": str(n.id),
            "event": n.event,
            "channel": n.channel,
            "recipient": n.recipient,
            "subject": n.subject,
            "status": n.status,
            "error": n.error,
            "created_at": n.created_at.isoformat(),
        }
        for n in rows
    ]
    return Page(items=items, total=total, page=page.page, size=page.size)


# Convenience wrappers used by other services.
async def order_placed(db: AsyncSession, order: Order, email: str | None) -> None:
    await emit_order_event(db, order, "order.placed", email)


async def order_status_changed(db: AsyncSession, order: Order, email: str | None) -> None:
    await emit_order_event(db, order, "order.status_changed", email)


NotificationStatusValues = {s.value for s in NotificationStatus}

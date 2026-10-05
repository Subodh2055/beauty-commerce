"""Returns and refunds.

A customer asks to return lines of a delivered order (within the platform's
return window). Staff approve or reject it with a note, mark the parcel
received (optionally putting the items back in stock), then record the refund.

Every money/stock step runs in one transaction with the order row locked, so
two refunds can never together exceed what the customer paid. Refunds are
recorded, not executed: staff pay them through the gateway dashboard or bank
and enter the reference here. A refund that brings the order's refunded total
to its full value moves the order (and every vendor sub-order) to REFUNDED.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationFailedError
from app.modules.inventory import service as inventory_service
from app.modules.orders import repository as orders_repo
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order, OrderStatusHistory
from app.modules.returns import repository as repo
from app.modules.returns.models import Refund, ReturnRequest
from app.modules.returns.schemas import (
    AdminReturnOut,
    RefundIn,
    RefundOut,
    ReturnCreateIn,
    ReturnItemOut,
    ReturnOut,
)
from app.modules.settings import service as settings_service
from app.shared.enums import InventoryReason, OrderStatus, PaymentStatus, ReturnStatus
from app.shared.pagination import Page, PageParams

Q = Decimal("0.01")


def _now() -> datetime:
    return datetime.now(UTC)


def _delivered_at(order: Order) -> datetime | None:
    stamps = [h.created_at for h in order.history if h.status == OrderStatus.DELIVERED]
    return max(stamps) if stamps else None


def _items_out(rr: ReturnRequest, order: Order) -> list[ReturnItemOut]:
    by_id = {str(i.id): i for i in order.items}
    out = []
    for line in rr.items:
        item = by_id.get(line["order_item_id"])
        if item is None:
            continue
        out.append(
            ReturnItemOut(
                order_item_id=item.id,
                product_name=item.product_name,
                variant_name=item.variant_name,
                sku=item.sku,
                image_url=item.image_url,
                unit_price=item.unit_price,
                quantity=line["quantity"],
            )
        )
    return out


def _out(rr: ReturnRequest, order: Order) -> dict:
    refunds = [RefundOut.model_validate(r, from_attributes=True) for r in rr.refunds]
    return {
        "id": rr.id,
        "reference": rr.reference,
        "order_id": rr.order_id,
        "order_number": order.order_number,
        "status": rr.status,
        "reason": rr.reason,
        "details": rr.details,
        "items": _items_out(rr, order),
        "requested_amount": rr.requested_amount,
        "refunded_amount": sum((r.amount for r in rr.refunds), Decimal("0")),
        "decision_note": rr.decision_note,
        "decided_at": rr.decided_at,
        "received_at": rr.received_at,
        "restocked": rr.restocked,
        "refunds": refunds,
        "created_at": rr.created_at,
        "updated_at": rr.updated_at,
    }


# --- customer ----------------------------------------------------------------


async def request_return(
    db: AsyncSession, user_id: uuid.UUID, order_id: uuid.UUID, body: ReturnCreateIn
) -> ReturnOut:
    order = await repo.get_order_for_user(db, order_id, user_id)
    if order is None:
        raise NotFoundError("Order not found")
    if order.status != OrderStatus.DELIVERED:
        raise ValidationFailedError("Only delivered orders can be returned")
    window = (await settings_service.get_settings(db)).return_window_days
    delivered = _delivered_at(order)
    if delivered is None or _now() - delivered > timedelta(days=window):
        raise ValidationFailedError(f"Returns are accepted within {window} days of delivery")

    by_id = {str(i.id): i for i in order.items}
    taken = await repo.returned_quantities(db, order.id)
    wanted: dict[str, int] = {}
    for line in body.items:
        key = str(line.order_item_id)
        wanted[key] = wanted.get(key, 0) + line.quantity
    amount = Decimal("0")
    for key, qty in wanted.items():
        item = by_id.get(key)
        if item is None:
            raise ValidationFailedError("That item isn't part of this order")
        left = item.quantity - taken.get(key, 0)
        if qty > left:
            raise ValidationFailedError(
                f"You can return at most {left} of {item.product_name} ({item.variant_name})"
            )
        amount += item.unit_price * qty

    rr = ReturnRequest(
        reference=await repo.next_reference(db),
        order_id=order.id,
        user_id=user_id,
        status=ReturnStatus.REQUESTED,
        reason=body.reason,
        details=(body.details or "").strip() or None,
        items=[{"order_item_id": k, "quantity": q} for k, q in wanted.items()],
        requested_amount=amount.quantize(Q),
    )
    db.add(rr)
    await db.commit()
    await db.refresh(rr)
    return ReturnOut(**_out(rr, order))


async def my_returns(db: AsyncSession, user_id: uuid.UUID) -> list[ReturnOut]:
    rows = await repo.list_for_user(db, user_id)
    orders = await repo.orders_by_id(db, {r.order_id for r in rows})
    return [ReturnOut(**_out(r, orders[r.order_id])) for r in rows if r.order_id in orders]


# --- admin -------------------------------------------------------------------


async def _admin_out(db: AsyncSession, rows: list[ReturnRequest]) -> list[AdminReturnOut]:
    orders = await repo.orders_by_id(db, {r.order_id for r in rows})
    users = await repo.users_by_id(db, {r.user_id for r in rows if r.user_id})
    refunded = await repo.refunded_by_order(db, set(orders))
    out = []
    for r in rows:
        order = orders.get(r.order_id)
        if order is None:
            continue
        user = users.get(r.user_id) if r.user_id else None
        out.append(
            AdminReturnOut(
                **_out(r, order),
                customer_email=user.email if user else None,
                customer_name=(user.full_name if user else None) or order.ship_recipient,
                order_total=order.total,
                currency=order.currency,
                order_refundable=max(Decimal("0"), order.total - refunded.get(order.id, 0)),
                payment_method=order.payment_method,
            )
        )
    return out


async def list_returns(
    db: AsyncSession, page: PageParams, status: str | None, q: str | None
) -> Page[AdminReturnOut]:
    rows, total = await repo.list_admin(db, status, q, page.offset, page.size)
    return Page(items=await _admin_out(db, rows), total=total, page=page.page, size=page.size)


async def get_return(db: AsyncSession, return_id: uuid.UUID) -> AdminReturnOut:
    rr = await repo.get(db, return_id)
    if rr is None:
        raise NotFoundError("Return not found")
    return (await _admin_out(db, [rr]))[0]


async def _locked(db: AsyncSession, return_id: uuid.UUID) -> tuple[ReturnRequest, Order]:
    rr = await repo.get(db, return_id, for_update=True)
    if rr is None:
        raise NotFoundError("Return not found")
    order = await repo.get_order_locked(db, rr.order_id)
    if order is None:
        raise NotFoundError("Order not found")
    return rr, order


async def approve(
    db: AsyncSession, return_id: uuid.UUID, staff_id: uuid.UUID, note: str | None
) -> AdminReturnOut:
    rr, _ = await _locked(db, return_id)
    if rr.status != ReturnStatus.REQUESTED:
        raise ValidationFailedError(f"A {rr.status.lower()} return can't be approved")
    rr.status, rr.decided_by, rr.decided_at = ReturnStatus.APPROVED, staff_id, _now()
    rr.decision_note = (note or "").strip() or None
    await db.commit()
    return await get_return(db, return_id)


async def reject(
    db: AsyncSession, return_id: uuid.UUID, staff_id: uuid.UUID, reason: str
) -> AdminReturnOut:
    rr, _ = await _locked(db, return_id)
    if rr.status not in (ReturnStatus.REQUESTED, ReturnStatus.APPROVED):
        raise ValidationFailedError(f"A {rr.status.lower()} return can't be rejected")
    rr.status, rr.decided_by, rr.decided_at = ReturnStatus.REJECTED, staff_id, _now()
    rr.decision_note = reason.strip()
    await db.commit()
    return await get_return(db, return_id)


async def receive(
    db: AsyncSession,
    return_id: uuid.UUID,
    staff_id: uuid.UUID,
    restock: bool,
    note: str | None,
) -> AdminReturnOut:
    """The parcel is back. Optionally put the returned quantities back on sale."""
    rr, order = await _locked(db, return_id)
    if rr.status != ReturnStatus.APPROVED:
        raise ValidationFailedError("Approve the return before marking it received")
    if restock:
        by_id = {str(i.id): i for i in order.items}
        lines = [
            (by_id[x["order_item_id"]], x["quantity"])
            for x in rr.items
            if x["order_item_id"] in by_id
        ]
        locked = await orders_repo.get_variants_for_update(
            db, [i.variant_id for i, _ in lines if i.variant_id]
        )
        for item, qty in lines:
            v = locked.get(item.variant_id) if item.variant_id else None
            if v is None:
                continue  # variant deleted since: nothing to restock
            v.stock_quantity += qty
            inventory_service.record(
                db,
                v,
                qty,
                InventoryReason.RESTOCK,
                order_id=order.id,
                note=f"Return {rr.reference}",
                created_by=staff_id,
            )
    rr.status, rr.received_at, rr.restocked = ReturnStatus.RECEIVED, _now(), restock
    if note and note.strip():
        rr.decision_note = note.strip()
    await db.commit()
    return await get_return(db, return_id)


async def _record_refund(
    db: AsyncSession,
    order: Order,
    body: RefundIn,
    staff_id: uuid.UUID,
    return_request: ReturnRequest | None,
) -> Refund:
    """Write the refund; when the order is now fully refunded, close it out.
    Caller holds the order lock and commits."""
    refundable = order.total - await repo.refunded_total(db, order.id)
    amount = body.amount.quantize(Q)
    if amount > refundable:
        raise ValidationFailedError(
            f"At most {order.currency} {refundable:,.2f} can still be refunded on this order"
        )
    refund = Refund(
        order_id=order.id,
        return_id=return_request.id if return_request else None,
        amount=amount,
        method=body.method,
        reference=(body.reference or "").strip() or None,
        note=(body.note or "").strip() or None,
        created_by=staff_id,
        created_at=_now(),
    )
    db.add(refund)
    full = amount == refundable
    label = return_request.reference if return_request else "manual"
    verb = "Refunded" if full else "Partial refund"
    order.history.append(
        OrderStatusHistory(
            status=OrderStatus.REFUNDED if full else order.status,
            note=f"{verb} {order.currency} {amount:,.2f} ({label})",
            created_at=_now(),
        )
    )
    if full:
        order.status = OrderStatus.REFUNDED
        order.payment_status = PaymentStatus.REFUNDED
        orders_service.apply_status_to_vendor_orders(order, OrderStatus.REFUNDED)
    return refund


async def refund(
    db: AsyncSession, return_id: uuid.UUID, staff_id: uuid.UUID, body: RefundIn
) -> AdminReturnOut:
    rr, order = await _locked(db, return_id)
    if rr.status not in (ReturnStatus.APPROVED, ReturnStatus.RECEIVED):
        raise ValidationFailedError("Only an approved or received return can be refunded")
    refund_row = await _record_refund(db, order, body, staff_id, rr)
    rr.refunds.append(refund_row)
    rr.status = ReturnStatus.REFUNDED
    await db.commit()
    return await get_return(db, return_id)


async def refund_remaining_on_status_change(
    db: AsyncSession, order: Order, staff_id: uuid.UUID
) -> None:
    """When staff move an order straight to REFUNDED (no return), record the
    outstanding amount as a refund so analytics and the refund ledger agree."""
    remaining = order.total - await repo.refunded_total(db, order.id)
    if remaining > 0:
        db.add(
            Refund(
                order_id=order.id,
                amount=remaining,
                method="ORIGINAL",
                note="Order refunded by status change",
                created_by=staff_id,
                created_at=_now(),
            )
        )

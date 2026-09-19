"""Order business logic.

Checkout is one transaction: re-price every line from the DB (never trust the
client), lock and validate stock, decrement it, snapshot line items + address,
create the order, its first status event and a payment row. Any failure rolls
the whole thing back so stock is never left decremented without an order.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationFailedError
from app.core.logging import get_logger
from app.integrations.payments import initiate_payment
from app.modules.coupons import service as coupons_service
from app.modules.inventory import service as inventory_service
from app.modules.notifications import service as notifications_service
from app.modules.orders import repository as repo
from app.modules.orders.models import (
    CANCELLABLE,
    Order,
    OrderItem,
    OrderStatusHistory,
    Payment,
)
from app.modules.orders.schemas import CheckoutIn, CheckoutResult, OrderDetail, OrderSummary
from app.shared.enums import InventoryReason, OrderStatus, PaymentMethod, PaymentStatus
from app.shared.pagination import Page, PageParams

log = get_logger(__name__)

FREE_SHIPPING_THRESHOLD = Decimal("5000")
SHIPPING_FEE = Decimal("150")
Q = Decimal("0.01")


def _summary(o: Order) -> OrderSummary:
    return OrderSummary(
        id=o.id,
        order_number=o.order_number,
        status=o.status,
        payment_method=o.payment_method,
        payment_status=o.payment_status,
        total=o.total,
        currency=o.currency,
        created_at=o.created_at,
        item_count=sum(i.quantity for i in o.items),
    )


def _now() -> datetime:
    return datetime.now(UTC)


async def checkout(
    db: AsyncSession, user_id: uuid.UUID, user_email: str | None, body: CheckoutIn
) -> CheckoutResult:
    # Collapse duplicate variant lines and lock rows.
    wanted: dict[uuid.UUID, int] = {}
    for line in body.items:
        wanted[line.variant_id] = wanted.get(line.variant_id, 0) + line.quantity

    variants = await repo.get_variants_for_update(db, list(wanted))
    missing = [str(vid) for vid in wanted if vid not in variants]
    if missing:
        raise NotFoundError(f"Some items are no longer available: {', '.join(missing)}")

    subtotal = Decimal("0")
    tax_total = Decimal("0")
    items: list[OrderItem] = []

    for variant_id, qty in wanted.items():
        v = variants[variant_id]
        product = v.product
        if product is None or product.status != "PUBLISHED":
            raise ConflictError(f"'{v.name}' is not available for purchase")
        if v.stock_quantity < qty:
            raise ConflictError(
                f"Only {v.stock_quantity} of '{product.name} — {v.name}' left in stock"
            )

        unit_price = Decimal(v.price)
        line_total = (unit_price * qty).quantize(Q)
        subtotal += line_total
        tax_total += (line_total * Decimal(product.tax_rate) / Decimal(100)).quantize(Q)

        v.stock_quantity -= qty  # decrement within the locked transaction
        inventory_service.record(db, v, -qty, InventoryReason.SALE, note="Checkout")

        primary_image = next((i for i in product.images if i.is_primary), None) or (
            product.images[0] if product.images else None
        )
        items.append(
            OrderItem(
                product_id=product.id,
                variant_id=v.id,
                product_name=product.name,
                variant_name=v.name,
                sku=v.sku,
                image_url=primary_image.url if primary_image else None,
                slug=product.slug,
                unit_price=unit_price,
                quantity=qty,
                line_total=line_total,
            )
        )

    subtotal = subtotal.quantize(Q)

    # Coupon (validated against the server-computed subtotal, not the client's).
    coupon = None
    discount_total = Decimal("0")
    if body.coupon_code:
        coupon, discount_total = await coupons_service.evaluate(
            db, body.coupon_code, subtotal, user_id
        )

    shipping_fee = Decimal("0") if subtotal >= FREE_SHIPPING_THRESHOLD else SHIPPING_FEE
    # Prices are VAT-inclusive, so tax is reported, not added on top.
    total = (subtotal - discount_total + shipping_fee).quantize(Q)

    method = body.payment_method
    # For COD the order is accepted immediately; online methods await payment.
    order_status = (
        OrderStatus.PROCESSING if method == PaymentMethod.COD else OrderStatus.PENDING_PAYMENT
    )

    addr = body.shipping_address
    order = Order(
        order_number=await repo.next_order_number(db),
        user_id=user_id,
        status=order_status,
        subtotal=subtotal,
        shipping_fee=shipping_fee,
        tax_total=tax_total.quantize(Q),
        discount_total=discount_total,
        total=total,
        currency="NPR",
        payment_method=method,
        payment_status=PaymentStatus.PENDING,
        ship_recipient=addr.recipient_name,
        ship_phone=addr.phone,
        ship_line1=addr.line1,
        ship_line2=addr.line2,
        ship_city=addr.city,
        ship_state=addr.state,
        ship_postal_code=addr.postal_code,
        ship_country=addr.country.upper(),
        customer_note=body.customer_note,
    )
    order.items = items
    order.history.append(
        OrderStatusHistory(
            status=order_status,
            note="Order placed" if method == PaymentMethod.COD else "Awaiting payment",
            created_at=_now(),
        )
    )

    # Payment provider (COD returns pending; online raises until configured).
    initiation = initiate_payment(method, order.order_number, total, order.currency)
    order.payments.append(
        Payment(
            method=method,
            status=initiation.status,
            amount=total,
            currency=order.currency,
            provider_ref=initiation.provider_ref,
        )
    )

    db.add(order)
    await db.flush()  # assign order.id for the coupon-usage row

    if coupon is not None:
        await coupons_service.redeem(db, coupon, user_id, order.id, discount_total)

    await db.commit()
    await db.refresh(order)

    log.info(
        "order_created",
        order_number=order.order_number,
        method=method,
        total=str(total),
        items=len(items),
    )

    # Best-effort: confirmation to customer (+ admins, via n8n fan-out).
    await notifications_service.order_placed(db, order, user_email)

    message = (
        "Order placed. Pay in cash when it arrives."
        if method == PaymentMethod.COD
        else "Order created. Complete payment to confirm."
    )
    return CheckoutResult(
        order=OrderDetail.model_validate(order),
        payment_redirect_url=initiation.redirect_url,
        message=message,
    )


async def list_my_orders(
    db: AsyncSession, user_id: uuid.UUID, page: PageParams
) -> Page[OrderSummary]:
    rows, total = await repo.list_orders_for_user(db, user_id, page.offset, page.size)
    return Page(items=[_summary(o) for o in rows], total=total, page=page.page, size=page.size)


async def get_my_order(db: AsyncSession, user_id: uuid.UUID, order_id: uuid.UUID) -> OrderDetail:
    order = await repo.get_order_for_user(db, order_id, user_id)
    if order is None:
        raise NotFoundError("Order not found")
    return OrderDetail.model_validate(order)


async def cancel_my_order(
    db: AsyncSession, user_id: uuid.UUID, user_email: str | None, order_id: uuid.UUID
) -> OrderDetail:
    order = await repo.get_order_for_user(db, order_id, user_id)
    if order is None:
        raise NotFoundError("Order not found")
    if order.status not in CANCELLABLE:
        raise ValidationFailedError(f"An order that is {order.status} can no longer be cancelled")

    # Restock and lock the variants back.
    variant_ids = [i.variant_id for i in order.items if i.variant_id]
    if variant_ids:
        locked = await repo.get_variants_for_update(db, variant_ids)
        for item in order.items:
            v = locked.get(item.variant_id) if item.variant_id else None
            if v is not None:
                v.stock_quantity += item.quantity
                inventory_service.record(
                    db,
                    v,
                    item.quantity,
                    InventoryReason.CANCEL,
                    order_id=order.id,
                    note="Order cancelled",
                )

    order.status = OrderStatus.CANCELLED
    order.payment_status = PaymentStatus.FAILED
    order.history.append(
        OrderStatusHistory(
            status=OrderStatus.CANCELLED, note="Cancelled by customer", created_at=_now()
        )
    )
    await db.commit()
    await db.refresh(order)
    await notifications_service.order_status_changed(db, order, user_email)
    return OrderDetail.model_validate(order)

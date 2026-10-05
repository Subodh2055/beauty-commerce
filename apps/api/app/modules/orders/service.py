"""Order business logic.

Checkout is one transaction: re-price every line from the DB (never trust the
client), lock and validate stock, decrement it, snapshot line items + address,
split the lines into one VendorOrder per seller with its commission snapshot,
create the order, its first status event and a payment row. Any failure rolls
the whole thing back so stock is never left decremented without an order.

Status flows both ways between an order and its vendor sub-orders:
- down: admin/payment changes to the order apply to every sub-order
  (`apply_status_to_vendor_orders`);
- up: vendors ship/deliver their own sub-order, and the order follows once all
  live sub-orders agree (`sync_parent_status`).

Commission is charged on each seller's line subtotal. Coupons and shipping are
platform-level, so a discount is funded by the platform, not the vendor.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationFailedError
from app.core.logging import get_logger
from app.integrations.payments import initiate_payment
from app.modules.commission import repository as commission_repo
from app.modules.commission import service as commission_service
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
    VendorOrder,
)
from app.modules.orders.schemas import (
    CheckoutIn,
    CheckoutResult,
    OrderDetail,
    OrderSummary,
    VendorOrderOut,
    VendorOrderStatusIn,
)
from app.modules.settings import service as settings_service
from app.modules.settings.schemas import PlatformSettings
from app.modules.vendors.models import Vendor
from app.shared.enums import (
    InventoryReason,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    VendorOrderStatus,
    VendorStatus,
)
from app.shared.pagination import Page, PageParams

log = get_logger(__name__)

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

    platform = await settings_service.get_settings(db)
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    items: list[OrderItem] = []
    by_seller: dict[uuid.UUID | None, list[OrderItem]] = {}
    line_category: dict[int, uuid.UUID | None] = {}  # id(OrderItem) -> category
    sellers: dict[uuid.UUID, Vendor] = {}

    for variant_id, qty in wanted.items():
        v = variants[variant_id]
        product = v.product
        if product is None or product.status != "PUBLISHED":
            raise ConflictError(f"'{v.name}' is not available for purchase")
        if product.vendor is not None and product.vendor.status != VendorStatus.APPROVED:
            raise ConflictError(f"'{product.name}' is not available for purchase")
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
        item = OrderItem(
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
        items.append(item)
        by_seller.setdefault(product.vendor_id, []).append(item)
        line_category[id(item)] = product.category_id
        if product.vendor is not None:
            sellers[product.vendor.id] = product.vendor

    subtotal = subtotal.quantize(Q)

    # Coupon (validated against the server-computed subtotal, not the client's).
    coupon = None
    discount_total = Decimal("0")
    if body.coupon_code:
        coupon, discount_total = await coupons_service.evaluate(
            db, body.coupon_code, subtotal, user_id
        )

    addr = body.shipping_address
    shipping_fee = settings_service.shipping_fee_for(platform, subtotal, addr.city, addr.state)
    # Tax-inclusive prices (the default) report tax; otherwise it is added on top.
    added_tax = Decimal("0") if platform.taxes.prices_include_tax else tax_total.quantize(Q)
    total = (subtotal - discount_total + shipping_fee + added_tax).quantize(Q)

    method = body.payment_method
    if method not in platform.payments.enabled_methods:
        raise ValidationFailedError("That payment method isn't available right now")
    cod_cap = platform.payments.cod_max_total
    if method == PaymentMethod.COD and cod_cap is not None and total > cod_cap:
        raise ValidationFailedError(
            f"Cash on delivery is available for orders up to {platform.base_currency} "
            f"{cod_cap:,.0f}. Please choose another payment method."
        )
    # For COD the order is accepted immediately; online methods await payment.
    order_status = (
        OrderStatus.PROCESSING if method == PaymentMethod.COD else OrderStatus.PENDING_PAYMENT
    )

    order = Order(
        order_number=await repo.next_order_number(db),
        user_id=user_id,
        status=order_status,
        subtotal=subtotal,
        shipping_fee=shipping_fee,
        tax_total=tax_total.quantize(Q),
        discount_total=discount_total,
        total=total,
        currency=platform.base_currency,
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
    sub_status = (
        VendorOrderStatus.PROCESSING if method == PaymentMethod.COD else VendorOrderStatus.PENDING
    )
    tree = await commission_repo.category_tree(db)
    for vendor_id, lines in by_seller.items():
        order.vendor_orders.append(
            _vendor_order(
                vendor_id, sellers.get(vendor_id), lines, sub_status, platform, tree, line_category
            )
        )
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


def _vendor_order(
    vendor_id: uuid.UUID | None,
    vendor: "Vendor | None",
    lines: list[OrderItem],
    status: str,
    platform: PlatformSettings,
    tree: commission_service.CategoryTree,
    line_category: dict[int, uuid.UUID | None],
) -> VendorOrder:
    """One seller's share with its money split. Each line's rate (vendor
    override → category → global) is snapshotted on the line, and the
    sub-order keeps the total: later rule changes never alter what this sale
    owes the vendor."""
    sub = sum((i.line_total for i in lines), Decimal("0")).quantize(Q)
    commission = Decimal("0")
    rates: set[Decimal] = set()
    for item in lines:
        rate = commission_service.line_rate(
            vendor, line_category.get(id(item)), tree, platform.default_commission_rate
        )
        item.commission_rate = rate
        item.commission_amount = (
            (item.line_total * rate / Decimal(100)).quantize(Q) if rate is not None else None
        )
        if rate is not None:
            rates.add(rate)
            commission += item.commission_amount
    if vendor is None:
        rate, commission, earnings = None, Decimal("0"), Decimal("0")
    else:
        # One rate when every line agrees; otherwise the blended effective rate.
        if len(rates) == 1:
            rate = rates.pop()
        else:
            rate = (commission / sub * 100).quantize(Q) if sub else None
        earnings = sub - commission
    return VendorOrder(
        vendor_id=vendor_id,
        status=status,
        subtotal=sub,
        commission_rate=rate,
        commission_amount=commission,
        vendor_earnings=earnings,
        items=lines,
    )


async def restock_order(
    db: AsyncSession, order: Order, *, note: str, created_by: uuid.UUID | None = None
) -> None:
    """Return every line's quantity to stock (locked) with a ledger entry.
    Caller owns the transaction and the order's status change."""
    variant_ids = [i.variant_id for i in order.items if i.variant_id]
    if not variant_ids:
        return
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
                note=note,
                created_by=created_by,
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
    if any(
        vo.status in (VendorOrderStatus.SHIPPED, VendorOrderStatus.DELIVERED)
        for vo in order.vendor_orders
    ):
        raise ValidationFailedError("Part of this order has already shipped; contact support")

    await restock_order(db, order, note="Order cancelled")

    order.status = OrderStatus.CANCELLED
    order.payment_status = PaymentStatus.FAILED
    apply_status_to_vendor_orders(order, OrderStatus.CANCELLED)
    order.history.append(
        OrderStatusHistory(
            status=OrderStatus.CANCELLED, note="Cancelled by customer", created_at=_now()
        )
    )
    await db.commit()
    await db.refresh(order)
    await notifications_service.order_status_changed(db, order, user_email)
    return OrderDetail.model_validate(order)


# --- Order <-> vendor sub-order status ----------------------------------------

_CLOSED = {VendorOrderStatus.CANCELLED, VendorOrderStatus.REFUNDED}


def apply_status_to_vendor_orders(order: Order, status: str) -> None:
    """Push an order-level status change down to its live sub-orders."""
    now = _now()
    for vo in order.vendor_orders:
        if status == OrderStatus.REFUNDED:
            vo.status = VendorOrderStatus.REFUNDED
        elif vo.status in _CLOSED:
            continue
        elif status in (OrderStatus.CANCELLED, OrderStatus.PAYMENT_FAILED):
            vo.status = VendorOrderStatus.CANCELLED
        elif status in (OrderStatus.PAID, OrderStatus.PROCESSING):
            if vo.status == VendorOrderStatus.PENDING:
                vo.status = VendorOrderStatus.PROCESSING
        elif status == OrderStatus.SHIPPED:
            if vo.status in (
                VendorOrderStatus.PENDING,
                VendorOrderStatus.PROCESSING,
                VendorOrderStatus.PACKED,
            ):
                vo.status, vo.shipped_at = VendorOrderStatus.SHIPPED, vo.shipped_at or now
        elif status == OrderStatus.DELIVERED:
            vo.status = VendorOrderStatus.DELIVERED
            vo.shipped_at = vo.shipped_at or now
            vo.delivered_at = vo.delivered_at or now


def sync_parent_status(order: Order) -> str | None:
    """Advance the order once every live sub-order has shipped/delivered.
    Returns the new status, or None if nothing changed."""
    live = [vo for vo in order.vendor_orders if vo.status not in _CLOSED]
    if not live:
        return None
    new: str | None = None
    if all(vo.status == VendorOrderStatus.DELIVERED for vo in live):
        if order.status in (OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED):
            new = OrderStatus.DELIVERED
    elif all(vo.status in (VendorOrderStatus.SHIPPED, VendorOrderStatus.DELIVERED) for vo in live):
        if order.status in (OrderStatus.PAID, OrderStatus.PROCESSING):
            new = OrderStatus.SHIPPED
    if new is not None:
        order.status = new
        order.history.append(
            OrderStatusHistory(status=new, note=f"All items {new.lower()}", created_at=_now())
        )
    return new


# --- Vendor portal ------------------------------------------------------------

# The seller's pipeline: new (PROCESSING) → packed → shipped → delivered. Packing is
# optional, so a new order may also go straight to shipped.
VENDOR_TRANSITIONS: dict[str, set[str]] = {
    VendorOrderStatus.PROCESSING: {VendorOrderStatus.PACKED, VendorOrderStatus.SHIPPED},
    VendorOrderStatus.PACKED: {VendorOrderStatus.SHIPPED},
    VendorOrderStatus.SHIPPED: {VendorOrderStatus.DELIVERED},
}


def to_vendor_order_out(vo: VendorOrder) -> VendorOrderOut:
    o = vo.order
    return VendorOrderOut(
        id=vo.id,
        order_number=o.order_number,
        created_at=vo.created_at,
        status=vo.status,
        payment_status=o.payment_status,
        subtotal=vo.subtotal,
        commission_rate=vo.commission_rate,
        commission_amount=vo.commission_amount,
        vendor_earnings=vo.vendor_earnings,
        tracking_number=vo.tracking_number,
        shipped_at=vo.shipped_at,
        delivered_at=vo.delivered_at,
        paid_out=vo.payout_id is not None,
        items=vo.items,
        ship_recipient=o.ship_recipient,
        ship_phone=o.ship_phone,
        ship_line1=o.ship_line1,
        ship_line2=o.ship_line2,
        ship_city=o.ship_city,
        ship_state=o.ship_state,
        ship_postal_code=o.ship_postal_code,
        ship_country=o.ship_country,
    )


async def list_vendor_orders(
    db: AsyncSession, vendor_id: uuid.UUID, status: str | None, page: PageParams
) -> Page[VendorOrderOut]:
    rows, total = await repo.list_vendor_orders(db, vendor_id, status, page.offset, page.size)
    return Page(
        items=[to_vendor_order_out(vo) for vo in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


async def get_vendor_order(
    db: AsyncSession, vendor_id: uuid.UUID, vendor_order_id: uuid.UUID
) -> VendorOrderOut:
    vo = await repo.get_vendor_order(db, vendor_id, vendor_order_id)
    if vo is None:
        raise NotFoundError("Order not found")
    return to_vendor_order_out(vo)


async def update_vendor_order_status(
    db: AsyncSession,
    vendor_id: uuid.UUID,
    vendor_order_id: uuid.UUID,
    body: VendorOrderStatusIn,
) -> VendorOrderOut:
    vo = await repo.get_vendor_order(db, vendor_id, vendor_order_id, for_update=True)
    if vo is None:
        raise NotFoundError("Order not found")
    if body.status not in VENDOR_TRANSITIONS.get(vo.status, set()):
        raise ValidationFailedError(f"Cannot move this order from {vo.status} to {body.status}")
    now = _now()
    vo.status = body.status
    if body.status == VendorOrderStatus.SHIPPED:
        vo.shipped_at = now
        vo.tracking_number = body.tracking_number or vo.tracking_number
    elif body.status == VendorOrderStatus.DELIVERED:
        vo.delivered_at = now
    order = vo.order
    changed = sync_parent_status(order)
    await db.commit()
    if changed:
        email = await repo.user_email(db, order.user_id)
        await notifications_service.order_status_changed(db, order, email)
    return to_vendor_order_out(vo)

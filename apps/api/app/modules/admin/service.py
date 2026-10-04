"""Admin operations: dashboard stats, order status transitions (with inventory
side-effects), product moderation, coupon management, inventory adjustments."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationFailedError
from app.modules.admin.schemas import (
    AdminBrandRow,
    AdminCategoryRow,
    AdminOrderRow,
    AdminProductDetail,
    AdminProductRow,
    AdminStats,
    BrandWriteIn,
    CategoryWriteIn,
    OrderStatusUpdateIn,
    ProductUpdateIn,
    ProductWriteIn,
)
from app.modules.catalog import service as catalog_service
from app.modules.catalog.models import Brand, Category, Product, ProductVariant
from app.modules.coupons.models import Coupon
from app.modules.coupons.schemas import CouponCreateIn, CouponOut
from app.modules.inventory import service as inventory_service
from app.modules.notifications import service as notifications_service
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order, OrderStatusHistory
from app.modules.orders.schemas import OrderDetail
from app.modules.users.models import User
from app.shared.enums import OrderStatus, PaymentStatus, ProductStatus
from app.shared.pagination import Page, PageParams

REVENUE_STATUSES = (
    OrderStatus.PAID,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
)
OPEN_STATUSES = (OrderStatus.PENDING_PAYMENT, OrderStatus.PROCESSING, OrderStatus.PAID)
LOW_STOCK_THRESHOLD = 5

# Allowed forward transitions (plus cancel/refund handled separately).
TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.PENDING_PAYMENT: {
        OrderStatus.PAID,
        OrderStatus.PROCESSING,
        OrderStatus.CANCELLED,
        OrderStatus.PAYMENT_FAILED,
    },
    OrderStatus.PAID: {OrderStatus.PROCESSING, OrderStatus.CANCELLED, OrderStatus.REFUNDED},
    OrderStatus.PROCESSING: {OrderStatus.SHIPPED, OrderStatus.CANCELLED, OrderStatus.REFUNDED},
    OrderStatus.SHIPPED: {OrderStatus.DELIVERED, OrderStatus.REFUNDED},
    OrderStatus.DELIVERED: {OrderStatus.REFUNDED},
}
RESTOCK_STATUSES = {OrderStatus.CANCELLED, OrderStatus.REFUNDED}


async def stats(db: AsyncSession) -> AdminStats:
    orders_total = await db.scalar(select(func.count()).select_from(Order)) or 0
    orders_open = (
        await db.scalar(
            select(func.count()).select_from(Order).where(Order.status.in_(OPEN_STATUSES))
        )
        or 0
    )
    revenue = (
        await db.scalar(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.status.in_(REVENUE_STATUSES)
            )
        )
    ) or Decimal("0")
    products_total = await db.scalar(select(func.count()).select_from(Product)) or 0
    products_published = (
        await db.scalar(
            select(func.count()).select_from(Product).where(Product.status == "PUBLISHED")
        )
        or 0
    )
    low_stock = (
        await db.scalar(
            select(func.count())
            .select_from(ProductVariant)
            .where(ProductVariant.stock_quantity <= LOW_STOCK_THRESHOLD)
        )
        or 0
    )
    customers = await db.scalar(select(func.count()).select_from(User)) or 0

    return AdminStats(
        orders_total=orders_total,
        orders_open=orders_open,
        revenue_total=Decimal(revenue),
        products_total=products_total,
        products_published=products_published,
        low_stock_variants=low_stock,
        customers_total=customers,
    )


async def list_orders(
    db: AsyncSession, page: PageParams, status: str | None
) -> Page[AdminOrderRow]:
    base = select(Order).outerjoin(User, Order.user_id == User.id)
    if status:
        base = base.where(Order.status == status)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = (
        await db.execute(
            select(Order, User.email)
            .outerjoin(User, Order.user_id == User.id)
            .where(Order.status == status if status else True)
            .order_by(Order.created_at.desc())
            .offset(page.offset)
            .limit(page.size)
        )
    ).all()
    items = [
        AdminOrderRow(
            id=o.id,
            order_number=o.order_number,
            status=o.status,
            payment_method=o.payment_method,
            payment_status=o.payment_status,
            total=o.total,
            currency=o.currency,
            customer_email=email,
            item_count=sum(i.quantity for i in o.items),
            created_at=o.created_at,
        )
        for o, email in rows
    ]
    return Page(items=items, total=total, page=page.page, size=page.size)


async def get_order(db: AsyncSession, order_id: uuid.UUID) -> OrderDetail:
    order = await db.get(Order, order_id)
    if order is None:
        raise NotFoundError("Order not found")
    return OrderDetail.model_validate(order)


async def mark_order_paid(db: AsyncSession, order_id: uuid.UUID) -> OrderDetail:
    """Reconcile a COD (or any pending) order once payment has been collected.
    Only changes payment_status; the fulfilment status is untouched."""
    order = await db.get(Order, order_id)
    if order is None:
        raise NotFoundError("Order not found")
    if order.payment_status == PaymentStatus.PAID:
        raise ValidationFailedError("This order is already marked paid")
    if order.status in RESTOCK_STATUSES:
        raise ValidationFailedError("A cancelled or refunded order cannot be marked paid")

    order.payment_status = PaymentStatus.PAID
    for payment in order.payments:
        if payment.status == PaymentStatus.PENDING:
            payment.status = PaymentStatus.PAID
    order.history.append(
        OrderStatusHistory(
            status=order.status,
            note="Payment received",
            created_at=datetime.now(UTC),
        )
    )
    await db.commit()
    await db.refresh(order)
    return OrderDetail.model_validate(order)


async def update_order_status(
    db: AsyncSession, order_id: uuid.UUID, body: OrderStatusUpdateIn, admin_id: uuid.UUID
) -> OrderDetail:
    order = await db.get(Order, order_id)
    if order is None:
        raise NotFoundError("Order not found")

    new_status = body.status
    if new_status == order.status:
        raise ValidationFailedError("Order is already in that status")
    allowed = TRANSITIONS.get(order.status, set())
    if new_status not in allowed:
        raise ValidationFailedError(f"Cannot move an order from {order.status} to {new_status}")

    # Restock when cancelling/refunding an order that decremented stock.
    if new_status in RESTOCK_STATUSES:
        await orders_service.restock_order(
            db, order, note=f"Order {new_status.lower()}", created_by=admin_id
        )
        order.payment_status = (
            PaymentStatus.REFUNDED if new_status == OrderStatus.REFUNDED else PaymentStatus.FAILED
        )
    elif new_status == OrderStatus.PAID:
        order.payment_status = PaymentStatus.PAID

    order.status = new_status
    orders_service.apply_status_to_vendor_orders(order, new_status)
    order.history.append(
        OrderStatusHistory(
            status=new_status,
            note=body.note or f"Status changed to {new_status.lower()}",
            created_at=datetime.now(UTC),
        )
    )
    await db.commit()
    await db.refresh(order)

    # Notify the customer of the new status (best-effort).
    email = (
        await db.scalar(select(User.email).where(User.id == order.user_id))
        if order.user_id
        else None
    )
    await notifications_service.order_status_changed(db, order, email)
    return OrderDetail.model_validate(order)


def _row(p: Product) -> AdminProductRow:
    return AdminProductRow(
        id=p.id,
        name=p.name,
        slug=p.slug,
        sku=p.sku,
        status=p.status,
        is_featured=p.is_featured,
        base_price=p.base_price,
        currency=p.currency,
        product_type=p.product_type,
        brand_name=p.brand.name if p.brand else None,
        vendor_name=p.vendor.name if p.vendor else None,
        total_stock=sum(v.stock_quantity for v in p.variants),
        rating_avg=p.rating_avg,
        rating_count=p.rating_count,
    )


def _set_status(product: Product, status: str) -> None:
    """Admins may set any status directly (moderation endpoints are the audited
    happy path); publishing stamps published_at the first time."""
    if status == ProductStatus.PUBLISHED and product.published_at is None:
        product.published_at = datetime.now(UTC)
    product.status = status


async def list_products(
    db: AsyncSession, page: PageParams, status: str | None, q: str | None
) -> Page[AdminProductRow]:
    base = select(Product)
    if status:
        base = base.where(Product.status == status)
    if q:
        base = base.where(Product.name.ilike(f"%{q}%"))
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = (
        (
            await db.scalars(
                base.order_by(Product.created_at.desc()).offset(page.offset).limit(page.size)
            )
        )
        .unique()
        .all()
    )

    items = [_row(p) for p in rows]
    return Page(items=items, total=total, page=page.page, size=page.size)


async def update_product(
    db: AsyncSession, product_id: uuid.UUID, body: ProductUpdateIn
) -> AdminProductRow:
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    if body.status is not None:
        _set_status(product, body.status)
    if body.is_featured is not None:
        product.is_featured = body.is_featured
    await db.commit()
    await db.refresh(product)
    return _row(product)


async def get_product_detail(db: AsyncSession, product_id: uuid.UUID) -> AdminProductDetail:
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    return AdminProductDetail.model_validate(product)


async def create_product(db: AsyncSession, body: ProductWriteIn) -> AdminProductDetail:
    product = catalog_service.new_product()
    await catalog_service.apply_write(db, product, body)
    _set_status(product, body.status)
    product.is_featured = body.is_featured
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return AdminProductDetail.model_validate(product)


async def update_product_full(
    db: AsyncSession, product_id: uuid.UUID, body: ProductWriteIn
) -> AdminProductDetail:
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    await catalog_service.apply_write(db, product, body)
    _set_status(product, body.status)
    product.is_featured = body.is_featured
    await db.commit()
    await db.refresh(product)
    return AdminProductDetail.model_validate(product)


# --- Moderation ---------------------------------------------------------------


async def approve_product(
    db: AsyncSession, product_id: uuid.UUID, reviewer_id: uuid.UUID
) -> AdminProductDetail:
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    catalog_service.approve(product, reviewer_id)
    await db.commit()
    await db.refresh(product)
    return AdminProductDetail.model_validate(product)


async def reject_product(
    db: AsyncSession, product_id: uuid.UUID, reviewer_id: uuid.UUID, reason: str
) -> AdminProductDetail:
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    catalog_service.reject(product, reviewer_id, reason)
    await db.commit()
    await db.refresh(product)
    return AdminProductDetail.model_validate(product)


async def delete_product(db: AsyncSession, product_id: uuid.UUID) -> None:
    product = await db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    # Order items keep their snapshot (product_id FK is SET NULL); variants,
    # images, reviews, wishlist entries cascade.
    await db.delete(product)
    await db.commit()


# --- Brand CRUD -------------------------------------------------------------


async def _product_counts(db: AsyncSession, column) -> dict[uuid.UUID, int]:
    rows = await db.execute(select(column, func.count()).where(column.isnot(None)).group_by(column))
    return {r[0]: r[1] for r in rows}


async def list_brands_admin(db: AsyncSession) -> list[AdminBrandRow]:
    brands = (await db.scalars(select(Brand).order_by(Brand.name))).all()
    counts = await _product_counts(db, Product.brand_id)
    return [
        AdminBrandRow.model_validate(b).model_copy(update={"product_count": counts.get(b.id, 0)})
        for b in brands
    ]


async def create_brand(db: AsyncSession, body: BrandWriteIn) -> AdminBrandRow:
    slug = await catalog_service.unique_slug(
        db, Brand, body.slug or catalog_service.slugify(body.name, "brand"), None
    )
    brand = Brand(
        name=body.name,
        slug=slug,
        description=body.description,
        logo_url=body.logo_url,
        country=body.country.upper() if body.country else None,
        is_active=body.is_active,
    )
    db.add(brand)
    await db.commit()
    await db.refresh(brand)
    return AdminBrandRow.model_validate(brand)


async def update_brand(db: AsyncSession, brand_id: uuid.UUID, body: BrandWriteIn) -> AdminBrandRow:
    brand = await db.get(Brand, brand_id)
    if brand is None:
        raise NotFoundError("Brand not found")
    brand.name = body.name
    brand.slug = await catalog_service.unique_slug(db, Brand, body.slug or brand.slug, brand_id)
    brand.description = body.description
    brand.logo_url = body.logo_url
    brand.country = body.country.upper() if body.country else None
    brand.is_active = body.is_active
    await db.commit()
    await db.refresh(brand)
    return AdminBrandRow.model_validate(brand)


async def delete_brand(db: AsyncSession, brand_id: uuid.UUID) -> None:
    brand = await db.get(Brand, brand_id)
    if brand is None:
        raise NotFoundError("Brand not found")
    # products.brand_id is SET NULL — products survive, just unbranded.
    await db.delete(brand)
    await db.commit()


# --- Category CRUD ----------------------------------------------------------


async def list_categories_admin(db: AsyncSession) -> list[AdminCategoryRow]:
    cats = (await db.scalars(select(Category).order_by(Category.sort_order, Category.name))).all()
    counts = await _product_counts(db, Product.category_id)
    return [
        AdminCategoryRow.model_validate(c).model_copy(update={"product_count": counts.get(c.id, 0)})
        for c in cats
    ]


async def create_category(db: AsyncSession, body: CategoryWriteIn) -> AdminCategoryRow:
    if body.parent_id and not await db.get(Category, body.parent_id):
        raise ValidationFailedError("Parent category not found")
    slug = await catalog_service.unique_slug(
        db, Category, body.slug or catalog_service.slugify(body.name, "category"), None
    )
    cat = Category(
        name=body.name,
        slug=slug,
        description=body.description,
        image_url=body.image_url,
        parent_id=body.parent_id,
        sort_order=body.sort_order,
        is_active=body.is_active,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return AdminCategoryRow.model_validate(cat)


async def update_category(
    db: AsyncSession, category_id: uuid.UUID, body: CategoryWriteIn
) -> AdminCategoryRow:
    cat = await db.get(Category, category_id)
    if cat is None:
        raise NotFoundError("Category not found")
    if body.parent_id == category_id:
        raise ValidationFailedError("A category cannot be its own parent")
    if body.parent_id and not await db.get(Category, body.parent_id):
        raise ValidationFailedError("Parent category not found")
    cat.name = body.name
    cat.slug = await catalog_service.unique_slug(db, Category, body.slug or cat.slug, category_id)
    cat.description = body.description
    cat.image_url = body.image_url
    cat.parent_id = body.parent_id
    cat.sort_order = body.sort_order
    cat.is_active = body.is_active
    await db.commit()
    await db.refresh(cat)
    return AdminCategoryRow.model_validate(cat)


async def delete_category(db: AsyncSession, category_id: uuid.UUID) -> None:
    cat = await db.get(Category, category_id)
    if cat is None:
        raise NotFoundError("Category not found")
    # products.category_id and children.parent_id are SET NULL.
    await db.delete(cat)
    await db.commit()


async def list_coupons(db: AsyncSession) -> list[CouponOut]:
    rows = (await db.scalars(select(Coupon).order_by(Coupon.created_at.desc()))).all()
    return [CouponOut.model_validate(c) for c in rows]


async def create_coupon(db: AsyncSession, body: CouponCreateIn) -> CouponOut:
    code = body.code.strip().upper()
    if await db.scalar(select(Coupon).where(Coupon.code == code)):
        raise ConflictError("A coupon with this code already exists")
    coupon = Coupon(
        code=code,
        description=body.description,
        discount_type=body.discount_type,
        value=body.value,
        min_subtotal=body.min_subtotal,
        max_discount=body.max_discount,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        usage_limit=body.usage_limit,
        per_user_limit=body.per_user_limit,
        is_active=body.is_active,
    )
    db.add(coupon)
    await db.commit()
    await db.refresh(coupon)
    return CouponOut.model_validate(coupon)


async def adjust_inventory(
    db: AsyncSession, variant_id: uuid.UUID, delta: int, note: str | None, admin_id: uuid.UUID
):
    from app.modules.admin.schemas import VariantStockOut

    variant = await inventory_service.adjust(db, variant_id, delta, note, admin_id)
    return VariantStockOut(
        id=variant.id, sku=variant.sku, name=variant.name, stock_quantity=variant.stock_quantity
    )

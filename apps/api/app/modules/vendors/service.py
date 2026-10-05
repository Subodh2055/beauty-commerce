"""Vendors: applications, admin review, and the vendor portal.

Application lifecycle:
    apply → PENDING ─approve→ APPROVED ⇄ SUSPENDED
                    └reject→ REJECTED ─(re-apply)→ PENDING
Approval grants the VENDOR role. Suspension keeps the role but makes the portal
read-only and hides the vendor's products (catalog `_published` filter).

Portal functions take the caller's `Vendor` (from dependencies.current_vendor)
and only touch rows through vendor-scoped repository functions.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError, NotFoundError, ValidationFailedError
from app.modules.admin.schemas import AdminProductDetail
from app.modules.audit import service as audit
from app.modules.catalog import repository as catalog_repo
from app.modules.catalog import service as catalog_service
from app.modules.catalog.schemas import ProductWriteBase
from app.modules.inventory import service as inventory_service
from app.modules.payouts import service as payouts_service
from app.modules.reviews.service import short_author
from app.modules.settings import service as settings_service
from app.modules.users.models import Role, User
from app.modules.vendors import repository as repo
from app.modules.vendors.models import Vendor
from app.modules.vendors.schemas import (
    BulkFailure,
    BulkProductIn,
    BulkProductResult,
    InventoryRow,
    LowStockItem,
    ReviewedProductRef,
    SalesPoint,
    SalesTotals,
    StockOut,
    StockSetIn,
    TopProduct,
    VendorAnalytics,
    VendorApplyIn,
    VendorOut,
    VendorProductRow,
    VendorPublic,
    VendorReviewList,
    VendorReviewRow,
    VendorSummary,
    VendorUpdateIn,
)
from app.shared.enums import InventoryReason, ProductStatus, VendorStatus
from app.shared.enums import Role as RoleName
from app.shared.pagination import Page, PageParams


def _now() -> datetime:
    return datetime.now(UTC)


# --- Applications (any signed-in user) ----------------------------------------


async def apply(db: AsyncSession, user: User, body: VendorApplyIn) -> VendorOut:
    if not (await settings_service.get_settings(db)).vendor_applications_open:
        raise ValidationFailedError("Vendor applications are closed right now")
    vendor = await repo.get_by_owner(db, user.id)
    if vendor is not None and vendor.status != VendorStatus.REJECTED:
        raise ConflictError("You already have a vendor account or a pending application")

    if vendor is None:
        slug = await catalog_service.unique_slug(
            db, Vendor, catalog_service.slugify(body.name, "store"), None
        )
        vendor = Vendor(owner_id=user.id, slug=slug)
        db.add(vendor)
    vendor.name = body.name
    vendor.description = body.description
    vendor.logo_url = body.logo_url
    vendor.contact_email = str(body.contact_email)
    vendor.contact_phone = body.contact_phone
    vendor.business_registration_no = body.business_registration_no
    vendor.tax_id = body.tax_id
    vendor.payout_details = body.payout_details
    vendor.status = VendorStatus.PENDING
    vendor.status_reason = None
    await db.commit()
    return VendorOut.model_validate(vendor)


async def get_mine(db: AsyncSession, user_id: uuid.UUID) -> VendorOut:
    vendor = await repo.get_by_owner(db, user_id)
    if vendor is None:
        raise NotFoundError("You have no vendor account")
    return VendorOut.model_validate(vendor)


async def update_mine(db: AsyncSession, user_id: uuid.UUID, body: VendorUpdateIn) -> VendorOut:
    vendor = await repo.get_by_owner(db, user_id)
    if vendor is None:
        raise NotFoundError("You have no vendor account")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(vendor, field, str(value) if field == "contact_email" and value else value)
    await db.commit()
    return VendorOut.model_validate(vendor)


async def get_public(db: AsyncSession, slug: str) -> VendorPublic:
    vendor = await repo.get_approved_by_slug(db, slug)
    if vendor is None:
        raise NotFoundError(f"Store '{slug}' not found")
    return VendorPublic.model_validate(vendor)


# --- Admin review --------------------------------------------------------------


async def list_vendors(
    db: AsyncSession, page: PageParams, status: str | None, q: str | None
) -> Page[VendorOut]:
    rows, total = await repo.list_vendors(db, status, q, page.offset, page.size)
    return Page(
        items=[VendorOut.model_validate(v) for v in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


async def _get(db: AsyncSession, vendor_id: uuid.UUID) -> Vendor:
    vendor = await db.get(Vendor, vendor_id, with_for_update=True)
    if vendor is None:
        raise NotFoundError("Vendor not found")
    return vendor


async def get_vendor(db: AsyncSession, vendor_id: uuid.UUID) -> VendorOut:
    vendor = await db.get(Vendor, vendor_id)
    if vendor is None:
        raise NotFoundError("Vendor not found")
    return VendorOut.model_validate(vendor)


def _decide(vendor: Vendor, status: str, reviewer_id: uuid.UUID, reason: str | None) -> None:
    vendor.status = status
    vendor.status_reason = reason
    vendor.reviewed_at = _now()
    vendor.reviewed_by = reviewer_id


async def approve(
    db: AsyncSession, vendor_id: uuid.UUID, reviewer_id: uuid.UUID, reason: str | None
) -> VendorOut:
    vendor = await _get(db, vendor_id)
    if vendor.status not in (VendorStatus.PENDING, VendorStatus.REJECTED):
        raise ValidationFailedError(f"A {vendor.status} vendor can't be approved")
    _decide(vendor, VendorStatus.APPROVED, reviewer_id, reason)

    owner = await db.get(User, vendor.owner_id)
    role = await db.scalar(select(Role).where(Role.name == RoleName.VENDOR))
    if owner is not None and role is not None and not owner.has_role(RoleName.VENDOR):
        owner.roles.append(role)
        # Association rows bypass the flush listener; log the grant explicitly.
        audit.record(db, "user_roles.grant", "users", owner.id, {"role": RoleName.VENDOR})
    await db.commit()
    return VendorOut.model_validate(vendor)


async def reject(
    db: AsyncSession, vendor_id: uuid.UUID, reviewer_id: uuid.UUID, reason: str
) -> VendorOut:
    vendor = await _get(db, vendor_id)
    if vendor.status != VendorStatus.PENDING:
        raise ValidationFailedError("Only pending applications can be rejected")
    _decide(vendor, VendorStatus.REJECTED, reviewer_id, reason)
    await db.commit()
    return VendorOut.model_validate(vendor)


async def suspend(
    db: AsyncSession, vendor_id: uuid.UUID, reviewer_id: uuid.UUID, reason: str
) -> VendorOut:
    vendor = await _get(db, vendor_id)
    if vendor.status != VendorStatus.APPROVED:
        raise ValidationFailedError("Only approved vendors can be suspended")
    _decide(vendor, VendorStatus.SUSPENDED, reviewer_id, reason)
    await db.commit()
    return VendorOut.model_validate(vendor)


async def reinstate(
    db: AsyncSession, vendor_id: uuid.UUID, reviewer_id: uuid.UUID, reason: str | None
) -> VendorOut:
    vendor = await _get(db, vendor_id)
    if vendor.status != VendorStatus.SUSPENDED:
        raise ValidationFailedError("Only suspended vendors can be reinstated")
    _decide(vendor, VendorStatus.APPROVED, reviewer_id, reason)
    await db.commit()
    return VendorOut.model_validate(vendor)


async def set_commission(db: AsyncSession, vendor_id: uuid.UUID, rate) -> VendorOut:
    """Applies to orders placed from now on; past sub-orders keep their snapshot."""
    vendor = await _get(db, vendor_id)
    vendor.commission_rate = rate
    await db.commit()
    return VendorOut.model_validate(vendor)


# --- Vendor portal: products --------------------------------------------------


def _product_row(p) -> VendorProductRow:
    return VendorProductRow(
        id=p.id,
        name=p.name,
        slug=p.slug,
        sku=p.sku,
        status=p.status,
        rejection_reason=p.rejection_reason,
        base_price=p.base_price,
        currency=p.currency,
        total_stock=sum(v.stock_quantity for v in p.variants),
        variant_count=len(p.variants),
        product_type=p.product_type,
        image_url=catalog_service.primary_image_url(p),
        updated_at=p.updated_at,
    )


async def _owned_product(db: AsyncSession, vendor: Vendor, product_id: uuid.UUID):
    product = await catalog_repo.get_vendor_product(db, vendor.id, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    return product


async def list_products(
    db: AsyncSession,
    vendor: Vendor,
    status: str | None,
    page: PageParams,
    q: str | None = None,
    sort: str = "updated",
) -> Page[VendorProductRow]:
    rows, total = await catalog_repo.list_vendor_products(
        db, vendor.id, status, page.offset, page.size, q=q, sort=sort
    )
    return Page(items=[_product_row(p) for p in rows], total=total, page=page.page, size=page.size)


async def get_product(
    db: AsyncSession, vendor: Vendor, product_id: uuid.UUID
) -> AdminProductDetail:
    return AdminProductDetail.model_validate(await _owned_product(db, vendor, product_id))


async def create_product(
    db: AsyncSession, vendor: Vendor, body: ProductWriteBase
) -> AdminProductDetail:
    product = catalog_service.new_product()
    product.vendor_id = vendor.id
    await catalog_service.apply_write(db, product, body)
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return AdminProductDetail.model_validate(product)


async def update_product(
    db: AsyncSession, vendor: Vendor, product_id: uuid.UUID, body: ProductWriteBase
) -> AdminProductDetail:
    product = await _owned_product(db, vendor, product_id)
    await catalog_service.apply_write(db, product, body)
    catalog_service.after_vendor_edit(product)
    await db.commit()
    await db.refresh(product)
    return AdminProductDetail.model_validate(product)


async def submit_product(
    db: AsyncSession, vendor: Vendor, product_id: uuid.UUID
) -> AdminProductDetail:
    product = await _owned_product(db, vendor, product_id)
    catalog_service.submit(product)
    await db.commit()
    await db.refresh(product)
    return AdminProductDetail.model_validate(product)


async def archive_product(
    db: AsyncSession, vendor: Vendor, product_id: uuid.UUID
) -> AdminProductDetail:
    product = await _owned_product(db, vendor, product_id)
    catalog_service.archive(product)
    await db.commit()
    await db.refresh(product)
    return AdminProductDetail.model_validate(product)


async def delete_product(db: AsyncSession, vendor: Vendor, product_id: uuid.UUID) -> None:
    product = await _owned_product(db, vendor, product_id)
    if product.status not in (ProductStatus.DRAFT, ProductStatus.REJECTED):
        raise ConflictError("Only draft or rejected products can be deleted; archive it instead")
    await db.delete(product)
    await db.commit()


async def set_stock(
    db: AsyncSession, vendor: Vendor, variant_id: uuid.UUID, body: StockSetIn, actor_id
) -> StockOut:
    """Stock-only change: no re-review, recorded in the inventory ledger."""
    variant = await catalog_repo.get_vendor_variant_for_update(db, vendor.id, variant_id)
    if variant is None:
        raise NotFoundError("Variant not found")
    delta = body.stock_quantity - variant.stock_quantity
    if delta:
        variant.stock_quantity = body.stock_quantity
        inventory_service.record(
            db, variant, delta, InventoryReason.ADJUST, note=body.note, created_by=actor_id
        )
        await db.commit()
    return StockOut(variant_id=variant.id, sku=variant.sku, stock_quantity=variant.stock_quantity)


async def summary(db: AsyncSession, vendor: Vendor) -> VendorSummary:
    return VendorSummary(
        vendor=VendorOut.model_validate(vendor),
        products_by_status=await repo.product_counts(db, vendor.id),
        orders_to_ship=await repo.orders_to_ship(db, vendor.id),
        earnings=await payouts_service.earnings(db, vendor.id),
    )


async def bulk_products(db: AsyncSession, vendor: Vendor, body: BulkProductIn) -> BulkProductResult:
    """Submit / archive / delete several of the vendor's own products in one
    transaction. Foreign or unknown ids fail individually as "not found"."""
    done: list[uuid.UUID] = []
    failed: list[BulkFailure] = []
    for product_id in dict.fromkeys(body.product_ids):  # de-duplicate, keep order
        product = await catalog_repo.get_vendor_product(db, vendor.id, product_id)
        if product is None:
            failed.append(BulkFailure(id=product_id, reason="Product not found"))
            continue
        try:
            if body.action == "submit":
                catalog_service.submit(product)
            elif body.action == "archive":
                catalog_service.archive(product)
            else:
                if product.status not in (ProductStatus.DRAFT, ProductStatus.REJECTED):
                    raise ConflictError("Only draft or rejected products can be deleted")
                await db.delete(product)
        except AppError as exc:
            failed.append(BulkFailure(id=product_id, reason=exc.message))
            continue
        done.append(product_id)
    await db.commit()
    return BulkProductResult(done=done, failed=failed)


# --- Vendor portal: reports -----------------------------------------------------

LOW_STOCK_THRESHOLD = 5
_REPORT_TZ = ZoneInfo(repo.REPORT_TZ)
_ZERO = Decimal("0")


def _totals(points: list[SalesPoint]) -> SalesTotals:
    revenue = sum((p.revenue for p in points), _ZERO)
    orders = sum(p.orders for p in points)
    return SalesTotals(
        revenue=revenue,
        earnings=sum((p.earnings for p in points), _ZERO),
        orders=orders,
        units=sum(p.units for p in points),
        avg_order_value=(revenue / orders).quantize(Decimal("0.01")) if orders else _ZERO,
    )


async def _series(db: AsyncSession, vendor_id: uuid.UUID, start, days: int) -> list[SalesPoint]:
    """Zero-filled daily points for [start, start + days) in the shop's local time."""
    since = datetime.combine(start, datetime.min.time(), _REPORT_TZ)
    until = since + timedelta(days=days)
    sales = {
        d: (rev, earn, n) for d, rev, earn, n in await repo.daily_sales(db, vendor_id, since, until)
    }
    units = await repo.daily_units(db, vendor_id, since, until)
    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        rev, earn, n = sales.get(d, (_ZERO, _ZERO, 0))
        out.append(
            SalesPoint(
                date=d,
                revenue=Decimal(rev or 0),
                earnings=Decimal(earn or 0),
                orders=int(n),
                units=units.get(d, 0),
            )
        )
    return out


async def analytics(db: AsyncSession, vendor: Vendor, days: int) -> VendorAnalytics:
    today = datetime.now(_REPORT_TZ).date()
    start = today - timedelta(days=days - 1)
    series = await _series(db, vendor.id, start, days)
    previous = await _series(db, vendor.id, start - timedelta(days=days), days)
    since = datetime.combine(start, datetime.min.time(), _REPORT_TZ)
    top = await repo.top_products(db, vendor.id, since)
    low = await repo.low_stock(db, vendor.id, LOW_STOCK_THRESHOLD)
    return VendorAnalytics(
        days=days,
        currency="NPR",
        series=series,
        totals=_totals(series),
        previous=_totals(previous),
        top_products=[
            TopProduct(
                product_id=pid,
                name=name,
                slug=slug,
                units=int(u),
                revenue=Decimal(rev),
                image_url=img,
            )
            for pid, name, slug, u, rev, img in top
        ],
        low_stock=[
            LowStockItem(
                variant_id=v.id,
                product_id=v.product_id,
                product_name=pname,
                variant_name=v.name,
                sku=v.sku,
                stock_quantity=v.stock_quantity,
            )
            for v, pname, _status in low
        ],
        low_stock_threshold=LOW_STOCK_THRESHOLD,
    )


async def inventory(
    db: AsyncSession, vendor: Vendor, q: str | None, low_only: bool, page: PageParams
) -> Page[InventoryRow]:
    rows, total = await repo.list_inventory(
        db, vendor.id, q, low_only, LOW_STOCK_THRESHOLD, page.offset, page.size
    )
    items = [
        InventoryRow(
            variant_id=v.id,
            product_id=v.product_id,
            product_name=pname,
            product_status=pstatus,
            variant_name=v.name,
            sku=v.sku,
            size_ml=v.size_ml,
            price=v.price,
            stock_quantity=v.stock_quantity,
            low=v.stock_quantity <= LOW_STOCK_THRESHOLD,
        )
        for v, pname, pstatus in rows
    ]
    return Page(items=items, total=total, page=page.page, size=page.size)


async def reviews(
    db: AsyncSession, vendor: Vendor, rating: int | None, page: PageParams
) -> VendorReviewList:
    rows, total = await repo.list_reviews(db, vendor.id, rating, page.offset, page.size)
    stars = await repo.review_breakdown(db, vendor.id)
    count = sum(stars.values())
    average = (
        (Decimal(sum(r * n for r, n in stars.items())) / count).quantize(Decimal("0.01"))
        if count
        else _ZERO
    )
    return VendorReviewList(
        items=[
            VendorReviewRow(
                id=r.id,
                rating=r.rating,
                title=r.title,
                body=r.body,
                author=short_author(r.author_name),
                is_verified_purchase=r.is_verified_purchase,
                created_at=r.created_at,
                product=ReviewedProductRef(name=name, slug=slug),
            )
            for r, name, slug in rows
        ],
        total=total,
        page=page.page,
        size=page.size,
        average=average,
        count=count,
        stars={str(i): stars.get(i, 0) for i in range(1, 6)},
    )

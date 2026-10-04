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
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationFailedError
from app.modules.admin.schemas import AdminProductDetail
from app.modules.audit import service as audit
from app.modules.catalog import repository as catalog_repo
from app.modules.catalog import service as catalog_service
from app.modules.catalog.schemas import ProductWriteBase
from app.modules.inventory import service as inventory_service
from app.modules.payouts import service as payouts_service
from app.modules.settings import service as settings_service
from app.modules.users.models import Role, User
from app.modules.vendors import repository as repo
from app.modules.vendors.models import Vendor
from app.modules.vendors.schemas import (
    StockOut,
    StockSetIn,
    VendorApplyIn,
    VendorOut,
    VendorProductRow,
    VendorPublic,
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
        updated_at=p.updated_at,
    )


async def _owned_product(db: AsyncSession, vendor: Vendor, product_id: uuid.UUID):
    product = await catalog_repo.get_vendor_product(db, vendor.id, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    return product


async def list_products(
    db: AsyncSession, vendor: Vendor, status: str | None, page: PageParams
) -> Page[VendorProductRow]:
    rows, total = await catalog_repo.list_vendor_products(
        db, vendor.id, status, page.offset, page.size
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

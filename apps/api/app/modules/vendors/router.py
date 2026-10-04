"""Three routers:

- `router`        /vendors          apply, own profile, public store page
- `portal_router` /vendor           the vendor portal (VENDOR_PORTAL, audited)
- `admin_router`  /admin/vendors    review + commission (VENDORS_MANAGE, audited)
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.admin.schemas import AdminProductDetail
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import CurrentUser, require_permission
from app.modules.catalog.schemas import ProductWriteBase
from app.modules.media import service as media_service
from app.modules.media.schemas import MediaAssetOut
from app.modules.orders import service as orders_service
from app.modules.orders.schemas import VendorOrderOut, VendorOrderStatusIn
from app.modules.payouts import service as payouts_service
from app.modules.payouts.schemas import PayoutDetail, PayoutOut
from app.modules.users.models import User
from app.modules.vendors import service
from app.modules.vendors.dependencies import ActiveVendor, CurrentVendor
from app.modules.vendors.schemas import (
    CommissionIn,
    StockOut,
    StockSetIn,
    VendorApplyIn,
    VendorDecisionIn,
    VendorOut,
    VendorProductRow,
    VendorPublic,
    VendorReasonIn,
    VendorSummary,
    VendorUpdateIn,
)
from app.shared.enums import Permission
from app.shared.pagination import Page, PageParams, page_params

DbSession = Annotated[AsyncSession, Depends(get_db)]
Paging = Annotated[PageParams, Depends(page_params)]

router = APIRouter()
portal_router = APIRouter(dependencies=[Audited])
admin_router = APIRouter(dependencies=[Audited])
VendorAdmin = Annotated[User, Depends(require_permission(Permission.VENDORS_MANAGE))]


# --- /vendors -----------------------------------------------------------------
# /me routes are declared before /{slug} so "me" isn't taken for a slug.


@router.post(
    "/apply",
    response_model=VendorOut,
    status_code=status.HTTP_201_CREATED,
    summary="Apply to sell on the marketplace",
)
async def apply(body: VendorApplyIn, db: DbSession, user: CurrentUser) -> VendorOut:
    return await service.apply(db, user, body)


@router.get("/me", response_model=VendorOut, summary="My vendor profile / application")
async def get_mine(db: DbSession, user: CurrentUser) -> VendorOut:
    return await service.get_mine(db, user.id)


@router.patch("/me", response_model=VendorOut, summary="Update my vendor profile")
async def update_mine(body: VendorUpdateIn, db: DbSession, user: CurrentUser) -> VendorOut:
    return await service.update_mine(db, user.id, body)


@router.get("/{slug}", response_model=VendorPublic, summary="Public store page")
async def get_public(slug: str, db: DbSession) -> VendorPublic:
    return await service.get_public(db, slug)


# --- /vendor (portal) -----------------------------------------------------------


@portal_router.get("/summary", response_model=VendorSummary)
async def portal_summary(db: DbSession, vendor: CurrentVendor) -> VendorSummary:
    return await service.summary(db, vendor)


@portal_router.get("/products", response_model=Page[VendorProductRow])
async def portal_products(
    db: DbSession, vendor: CurrentVendor, page: Paging, status: str | None = Query(default=None)
) -> Page[VendorProductRow]:
    return await service.list_products(db, vendor, status, page)


@portal_router.post(
    "/products", response_model=AdminProductDetail, status_code=status.HTTP_201_CREATED
)
async def portal_create_product(
    body: ProductWriteBase, db: DbSession, vendor: ActiveVendor
) -> AdminProductDetail:
    return await service.create_product(db, vendor, body)


@portal_router.get("/products/{product_id}", response_model=AdminProductDetail)
async def portal_get_product(
    product_id: uuid.UUID, db: DbSession, vendor: CurrentVendor
) -> AdminProductDetail:
    return await service.get_product(db, vendor, product_id)


@portal_router.put(
    "/products/{product_id}",
    response_model=AdminProductDetail,
    summary="Edit a product (a live product goes back to review)",
)
async def portal_update_product(
    product_id: uuid.UUID, body: ProductWriteBase, db: DbSession, vendor: ActiveVendor
) -> AdminProductDetail:
    return await service.update_product(db, vendor, product_id, body)


@portal_router.post("/products/{product_id}/submit", response_model=AdminProductDetail)
async def portal_submit_product(
    product_id: uuid.UUID, db: DbSession, vendor: ActiveVendor
) -> AdminProductDetail:
    return await service.submit_product(db, vendor, product_id)


@portal_router.post("/products/{product_id}/archive", response_model=AdminProductDetail)
async def portal_archive_product(
    product_id: uuid.UUID, db: DbSession, vendor: ActiveVendor
) -> AdminProductDetail:
    return await service.archive_product(db, vendor, product_id)


@portal_router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def portal_delete_product(product_id: uuid.UUID, db: DbSession, vendor: ActiveVendor) -> None:
    await service.delete_product(db, vendor, product_id)


@portal_router.put("/variants/{variant_id}/stock", response_model=StockOut)
async def portal_set_stock(
    variant_id: uuid.UUID,
    body: StockSetIn,
    db: DbSession,
    vendor: ActiveVendor,
    user: CurrentUser,
) -> StockOut:
    return await service.set_stock(db, vendor, variant_id, body, user.id)


@portal_router.get("/orders", response_model=Page[VendorOrderOut])
async def portal_orders(
    db: DbSession, vendor: CurrentVendor, page: Paging, status: str | None = Query(default=None)
) -> Page[VendorOrderOut]:
    return await orders_service.list_vendor_orders(db, vendor.id, status, page)


@portal_router.get("/orders/{vendor_order_id}", response_model=VendorOrderOut)
async def portal_order(
    vendor_order_id: uuid.UUID, db: DbSession, vendor: CurrentVendor
) -> VendorOrderOut:
    return await orders_service.get_vendor_order(db, vendor.id, vendor_order_id)


@portal_router.patch("/orders/{vendor_order_id}/status", response_model=VendorOrderOut)
async def portal_order_status(
    vendor_order_id: uuid.UUID, body: VendorOrderStatusIn, db: DbSession, vendor: ActiveVendor
) -> VendorOrderOut:
    return await orders_service.update_vendor_order_status(db, vendor.id, vendor_order_id, body)


@portal_router.get("/payouts", response_model=Page[PayoutOut])
async def portal_payouts(db: DbSession, vendor: CurrentVendor, page: Paging) -> Page[PayoutOut]:
    return await payouts_service.list_payouts(db, page, vendor_id=vendor.id, status=None)


@portal_router.get("/payouts/{payout_id}", response_model=PayoutDetail)
async def portal_payout(payout_id: uuid.UUID, db: DbSession, vendor: CurrentVendor) -> PayoutDetail:
    return await payouts_service.get_for_vendor(db, vendor.id, payout_id)


@portal_router.post(
    "/uploads",
    response_model=MediaAssetOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.MEDIA_UPLOAD))],
)
async def portal_upload(
    db: DbSession, vendor: ActiveVendor, user: CurrentUser, file: Annotated[UploadFile, File()]
) -> MediaAssetOut:
    return await media_service.upload(db, file, owner_id=user.id, vendor_id=vendor.id)


# --- /admin/vendors -----------------------------------------------------------


@admin_router.get("", response_model=Page[VendorOut])
async def admin_list_vendors(
    db: DbSession,
    _: VendorAdmin,
    page: Paging,
    status: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100),
) -> Page[VendorOut]:
    return await service.list_vendors(db, page, status, q)


@admin_router.get("/{vendor_id}", response_model=VendorOut)
async def admin_get_vendor(vendor_id: uuid.UUID, db: DbSession, _: VendorAdmin) -> VendorOut:
    return await service.get_vendor(db, vendor_id)


@admin_router.post("/{vendor_id}/approve", response_model=VendorOut)
async def admin_approve(
    vendor_id: uuid.UUID, body: VendorDecisionIn, db: DbSession, admin: VendorAdmin
) -> VendorOut:
    return await service.approve(db, vendor_id, admin.id, body.reason)


@admin_router.post("/{vendor_id}/reject", response_model=VendorOut)
async def admin_reject(
    vendor_id: uuid.UUID, body: VendorReasonIn, db: DbSession, admin: VendorAdmin
) -> VendorOut:
    return await service.reject(db, vendor_id, admin.id, body.reason)


@admin_router.post("/{vendor_id}/suspend", response_model=VendorOut)
async def admin_suspend(
    vendor_id: uuid.UUID, body: VendorReasonIn, db: DbSession, admin: VendorAdmin
) -> VendorOut:
    return await service.suspend(db, vendor_id, admin.id, body.reason)


@admin_router.post("/{vendor_id}/reinstate", response_model=VendorOut)
async def admin_reinstate(
    vendor_id: uuid.UUID, body: VendorDecisionIn, db: DbSession, admin: VendorAdmin
) -> VendorOut:
    return await service.reinstate(db, vendor_id, admin.id, body.reason)


@admin_router.put("/{vendor_id}/commission", response_model=VendorOut)
async def admin_commission(
    vendor_id: uuid.UUID, body: CommissionIn, db: DbSession, _: VendorAdmin
) -> VendorOut:
    return await service.set_commission(db, vendor_id, body.commission_rate)

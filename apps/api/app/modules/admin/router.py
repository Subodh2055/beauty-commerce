import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.admin import service
from app.modules.admin.schemas import (
    AdminBrandRow,
    AdminCategoryRow,
    AdminOrderRow,
    AdminProductDetail,
    AdminProductRow,
    AdminStats,
    BrandWriteIn,
    CategoryWriteIn,
    InventoryAdjustIn,
    OrderStatusUpdateIn,
    ProductUpdateIn,
    ProductWriteIn,
    VariantStockOut,
)
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import require_any_permission, require_permission
from app.modules.catalog import service as catalog_service
from app.modules.catalog.schemas import (
    FamilyWriteIn,
    FragranceFamilyOut,
    FragranceNoteOut,
    NoteWriteBody,
    RejectIn,
)
from app.modules.coupons.schemas import CouponCreateIn, CouponOut
from app.modules.media import service as media_service
from app.modules.media.schemas import MediaAssetOut
from app.modules.orders.schemas import OrderDetail
from app.modules.users.models import User
from app.shared.enums import Permission
from app.shared.pagination import Page, PageParams, page_params

# Every change made through this router is written to audit_logs.
router = APIRouter(dependencies=[Audited])

DbSession = Annotated[AsyncSession, Depends(get_db)]
Paging = Annotated[PageParams, Depends(page_params)]


def _can(code: Permission):
    return Annotated[User, Depends(require_permission(code))]


Dashboard = _can(Permission.DASHBOARD_VIEW)
OrdersView = _can(Permission.ORDERS_VIEW)
OrdersEdit = _can(Permission.ORDERS_EDIT)
ProductsView = _can(Permission.PRODUCTS_VIEW)
ProductsCreate = _can(Permission.PRODUCTS_CREATE)
ProductsEdit = _can(Permission.PRODUCTS_EDIT)
ProductsDelete = _can(Permission.PRODUCTS_DELETE)
ModerationView = _can(Permission.MODERATION_VIEW)
Moderator = _can(Permission.MODERATION_EDIT)
TaxonomyView = _can(Permission.TAXONOMY_VIEW)
TaxonomyCreate = _can(Permission.TAXONOMY_CREATE)
TaxonomyEdit = _can(Permission.TAXONOMY_EDIT)
TaxonomyDelete = _can(Permission.TAXONOMY_DELETE)
CouponsView = _can(Permission.COUPONS_VIEW)
CouponsCreate = _can(Permission.COUPONS_CREATE)
CouponsEdit = _can(Permission.COUPONS_EDIT)
CouponsDelete = _can(Permission.COUPONS_DELETE)
InventoryAdmin = _can(Permission.INVENTORY_EDIT)
Uploader = _can(Permission.MEDIA_UPLOAD)


@router.get("/stats", response_model=AdminStats)
async def get_stats(db: DbSession, _: Dashboard) -> AdminStats:
    return await service.stats(db)


@router.get("/orders", response_model=Page[AdminOrderRow])
async def list_orders(
    db: DbSession, _: OrdersView, page: Paging, status: str | None = Query(default=None)
) -> Page[AdminOrderRow]:
    return await service.list_orders(db, page, status)


@router.get("/orders/{order_id}", response_model=OrderDetail)
async def get_order(order_id: uuid.UUID, db: DbSession, _: OrdersView) -> OrderDetail:
    return await service.get_order(db, order_id)


@router.patch("/orders/{order_id}/status", response_model=OrderDetail)
async def update_order_status(
    order_id: uuid.UUID, body: OrderStatusUpdateIn, db: DbSession, admin: OrdersEdit
) -> OrderDetail:
    return await service.update_order_status(db, order_id, body, admin.id)


@router.post("/orders/{order_id}/mark-paid", response_model=OrderDetail)
async def mark_order_paid(order_id: uuid.UUID, db: DbSession, _: OrdersEdit) -> OrderDetail:
    return await service.mark_order_paid(db, order_id)


@router.get("/products", response_model=Page[AdminProductRow])
async def list_products(
    db: DbSession,
    _: ProductsView,
    page: Paging,
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> Page[AdminProductRow]:
    return await service.list_products(db, page, status, q)


@router.patch("/products/{product_id}", response_model=AdminProductRow)
async def update_product(
    product_id: uuid.UUID, body: ProductUpdateIn, db: DbSession, _: ProductsEdit
) -> AdminProductRow:
    return await service.update_product(db, product_id, body)


@router.get("/products/{product_id}", response_model=AdminProductDetail)
async def get_product(product_id: uuid.UUID, db: DbSession, _: ProductsView) -> AdminProductDetail:
    return await service.get_product_detail(db, product_id)


@router.post("/products", response_model=AdminProductDetail, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductWriteIn, db: DbSession, _: ProductsCreate
) -> AdminProductDetail:
    return await service.create_product(db, body)


@router.put("/products/{product_id}", response_model=AdminProductDetail)
async def update_product_full(
    product_id: uuid.UUID, body: ProductWriteIn, db: DbSession, _: ProductsEdit
) -> AdminProductDetail:
    return await service.update_product_full(db, product_id, body)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: uuid.UUID, db: DbSession, _: ProductsDelete) -> None:
    await service.delete_product(db, product_id)


@router.get(
    "/moderation",
    response_model=Page[AdminProductRow],
    summary="Products waiting for review (oldest first)",
)
async def moderation_queue(
    db: DbSession, _: ModerationView, page: Paging, q: str | None = Query(default=None)
) -> Page[AdminProductRow]:
    return await service.list_products(db, page, "PENDING", q, oldest_first=True)


@router.get("/moderation/{product_id}", response_model=AdminProductDetail)
async def moderation_item(
    product_id: uuid.UUID, db: DbSession, _: ModerationView
) -> AdminProductDetail:
    return await service.get_product_detail(db, product_id)


@router.post(
    "/products/{product_id}/approve",
    response_model=AdminProductDetail,
    summary="Approve a product pending review (publishes it)",
)
async def approve_product(
    product_id: uuid.UUID, db: DbSession, admin: Moderator
) -> AdminProductDetail:
    return await service.approve_product(db, product_id, admin.id)


@router.post(
    "/products/{product_id}/reject",
    response_model=AdminProductDetail,
    summary="Reject a product pending review",
)
async def reject_product(
    product_id: uuid.UUID, body: RejectIn, db: DbSession, admin: Moderator
) -> AdminProductDetail:
    return await service.reject_product(db, product_id, admin.id, body.reason)


@router.get("/brands", response_model=list[AdminBrandRow])
async def list_brands(db: DbSession, _: TaxonomyView) -> list[AdminBrandRow]:
    return await service.list_brands_admin(db)


@router.post("/brands", response_model=AdminBrandRow, status_code=status.HTTP_201_CREATED)
async def create_brand(body: BrandWriteIn, db: DbSession, _: TaxonomyCreate) -> AdminBrandRow:
    return await service.create_brand(db, body)


@router.put("/brands/{brand_id}", response_model=AdminBrandRow)
async def update_brand(
    brand_id: uuid.UUID, body: BrandWriteIn, db: DbSession, _: TaxonomyEdit
) -> AdminBrandRow:
    return await service.update_brand(db, brand_id, body)


@router.delete("/brands/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_brand(brand_id: uuid.UUID, db: DbSession, _: TaxonomyDelete) -> None:
    await service.delete_brand(db, brand_id)


@router.get("/categories", response_model=list[AdminCategoryRow])
async def list_categories(db: DbSession, _: TaxonomyView) -> list[AdminCategoryRow]:
    return await service.list_categories_admin(db)


@router.post("/categories", response_model=AdminCategoryRow, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryWriteIn, db: DbSession, _: TaxonomyCreate
) -> AdminCategoryRow:
    return await service.create_category(db, body)


@router.put("/categories/{category_id}", response_model=AdminCategoryRow)
async def update_category(
    category_id: uuid.UUID, body: CategoryWriteIn, db: DbSession, _: TaxonomyEdit
) -> AdminCategoryRow:
    return await service.update_category(db, category_id, body)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: uuid.UUID, db: DbSession, _: TaxonomyDelete) -> None:
    await service.delete_category(db, category_id)


@router.post(
    "/fragrance-families",
    response_model=FragranceFamilyOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_family(
    body: FamilyWriteIn, db: DbSession, _: TaxonomyCreate
) -> FragranceFamilyOut:
    return await catalog_service.create_family(db, body)


@router.put("/fragrance-families/{family_id}", response_model=FragranceFamilyOut)
async def update_family(
    family_id: uuid.UUID, body: FamilyWriteIn, db: DbSession, _: TaxonomyEdit
) -> FragranceFamilyOut:
    return await catalog_service.update_family(db, family_id, body)


@router.delete("/fragrance-families/{family_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_family(family_id: uuid.UUID, db: DbSession, _: TaxonomyDelete) -> None:
    await catalog_service.delete_family(db, family_id)


@router.post(
    "/fragrance-notes", response_model=FragranceNoteOut, status_code=status.HTTP_201_CREATED
)
async def create_note(body: NoteWriteBody, db: DbSession, _: TaxonomyCreate) -> FragranceNoteOut:
    return await catalog_service.create_note(db, body)


@router.put("/fragrance-notes/{note_id}", response_model=FragranceNoteOut)
async def update_note(
    note_id: uuid.UUID, body: NoteWriteBody, db: DbSession, _: TaxonomyEdit
) -> FragranceNoteOut:
    return await catalog_service.update_note(db, note_id, body)


@router.delete("/fragrance-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(note_id: uuid.UUID, db: DbSession, _: TaxonomyDelete) -> None:
    await catalog_service.delete_note(db, note_id)


@router.get("/coupons", response_model=list[CouponOut])
async def list_coupons(db: DbSession, _: CouponsView) -> list[CouponOut]:
    return await service.list_coupons(db)


@router.post("/coupons", response_model=CouponOut, status_code=status.HTTP_201_CREATED)
async def create_coupon(body: CouponCreateIn, db: DbSession, _: CouponsCreate) -> CouponOut:
    return await service.create_coupon(db, body)


@router.put("/coupons/{coupon_id}", response_model=CouponOut)
async def update_coupon(
    coupon_id: uuid.UUID, body: CouponCreateIn, db: DbSession, _: CouponsEdit
) -> CouponOut:
    return await service.update_coupon(db, coupon_id, body)


@router.delete("/coupons/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_coupon(coupon_id: uuid.UUID, db: DbSession, _: CouponsDelete) -> None:
    await service.delete_coupon(db, coupon_id)


@router.post("/inventory/adjust", response_model=VariantStockOut)
async def adjust_inventory(
    body: InventoryAdjustIn, db: DbSession, admin: InventoryAdmin
) -> VariantStockOut:
    return await service.adjust_inventory(db, body.variant_id, body.delta, body.note, admin.id)


@router.get("/notifications", response_model=Page[dict], summary="Recent notifications")
async def list_notifications(db: DbSession, _: Dashboard, page: Paging) -> Page[dict]:
    from app.modules.notifications import service as notifications_service

    return await notifications_service.list_notifications(db, page)


@router.post(
    "/uploads",
    response_model=MediaAssetOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an image (resized to WebP in the background)",
    # media.upload alone isn't enough: vendors hold it for /vendor/uploads.
    # Platform-owned media is for staff who edit the catalog or content.
    dependencies=[
        Depends(
            require_any_permission(
                Permission.PRODUCTS_CREATE,
                Permission.PRODUCTS_EDIT,
                Permission.TAXONOMY_CREATE,
                Permission.TAXONOMY_EDIT,
                Permission.CMS_CREATE,
                Permission.CMS_EDIT,
            )
        )
    ],
)
async def upload_image(
    db: DbSession, user: Uploader, file: Annotated[UploadFile, File()]
) -> MediaAssetOut:
    return await media_service.upload(db, file, owner_id=user.id, vendor_id=None)

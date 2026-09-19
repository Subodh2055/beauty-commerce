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
from app.modules.admin.uploads import save_upload
from app.modules.auth.dependencies import AdminUser
from app.modules.coupons.schemas import CouponCreateIn, CouponOut
from app.modules.orders.schemas import OrderDetail
from app.shared.pagination import Page, PageParams, page_params

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]
Paging = Annotated[PageParams, Depends(page_params)]


@router.get("/stats", response_model=AdminStats)
async def get_stats(db: DbSession, _: AdminUser) -> AdminStats:
    return await service.stats(db)


@router.get("/orders", response_model=Page[AdminOrderRow])
async def list_orders(
    db: DbSession, _: AdminUser, page: Paging, status: str | None = Query(default=None)
) -> Page[AdminOrderRow]:
    return await service.list_orders(db, page, status)


@router.get("/orders/{order_id}", response_model=OrderDetail)
async def get_order(order_id: uuid.UUID, db: DbSession, _: AdminUser) -> OrderDetail:
    return await service.get_order(db, order_id)


@router.patch("/orders/{order_id}/status", response_model=OrderDetail)
async def update_order_status(
    order_id: uuid.UUID, body: OrderStatusUpdateIn, db: DbSession, admin: AdminUser
) -> OrderDetail:
    return await service.update_order_status(db, order_id, body, admin.id)


@router.post("/orders/{order_id}/mark-paid", response_model=OrderDetail)
async def mark_order_paid(order_id: uuid.UUID, db: DbSession, _: AdminUser) -> OrderDetail:
    return await service.mark_order_paid(db, order_id)


@router.get("/products", response_model=Page[AdminProductRow])
async def list_products(
    db: DbSession,
    _: AdminUser,
    page: Paging,
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> Page[AdminProductRow]:
    return await service.list_products(db, page, status, q)


@router.patch("/products/{product_id}", response_model=AdminProductRow)
async def update_product(
    product_id: uuid.UUID, body: ProductUpdateIn, db: DbSession, _: AdminUser
) -> AdminProductRow:
    return await service.update_product(db, product_id, body)


@router.get("/products/{product_id}", response_model=AdminProductDetail)
async def get_product(product_id: uuid.UUID, db: DbSession, _: AdminUser) -> AdminProductDetail:
    return await service.get_product_detail(db, product_id)


@router.post("/products", response_model=AdminProductDetail, status_code=status.HTTP_201_CREATED)
async def create_product(body: ProductWriteIn, db: DbSession, _: AdminUser) -> AdminProductDetail:
    return await service.create_product(db, body)


@router.put("/products/{product_id}", response_model=AdminProductDetail)
async def update_product_full(
    product_id: uuid.UUID, body: ProductWriteIn, db: DbSession, _: AdminUser
) -> AdminProductDetail:
    return await service.update_product_full(db, product_id, body)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: uuid.UUID, db: DbSession, _: AdminUser) -> None:
    await service.delete_product(db, product_id)


@router.get("/brands", response_model=list[AdminBrandRow])
async def list_brands(db: DbSession, _: AdminUser) -> list[AdminBrandRow]:
    return await service.list_brands_admin(db)


@router.post("/brands", response_model=AdminBrandRow, status_code=status.HTTP_201_CREATED)
async def create_brand(body: BrandWriteIn, db: DbSession, _: AdminUser) -> AdminBrandRow:
    return await service.create_brand(db, body)


@router.put("/brands/{brand_id}", response_model=AdminBrandRow)
async def update_brand(
    brand_id: uuid.UUID, body: BrandWriteIn, db: DbSession, _: AdminUser
) -> AdminBrandRow:
    return await service.update_brand(db, brand_id, body)


@router.delete("/brands/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_brand(brand_id: uuid.UUID, db: DbSession, _: AdminUser) -> None:
    await service.delete_brand(db, brand_id)


@router.get("/categories", response_model=list[AdminCategoryRow])
async def list_categories(db: DbSession, _: AdminUser) -> list[AdminCategoryRow]:
    return await service.list_categories_admin(db)


@router.post("/categories", response_model=AdminCategoryRow, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryWriteIn, db: DbSession, _: AdminUser) -> AdminCategoryRow:
    return await service.create_category(db, body)


@router.put("/categories/{category_id}", response_model=AdminCategoryRow)
async def update_category(
    category_id: uuid.UUID, body: CategoryWriteIn, db: DbSession, _: AdminUser
) -> AdminCategoryRow:
    return await service.update_category(db, category_id, body)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: uuid.UUID, db: DbSession, _: AdminUser) -> None:
    await service.delete_category(db, category_id)


@router.get("/coupons", response_model=list[CouponOut])
async def list_coupons(db: DbSession, _: AdminUser) -> list[CouponOut]:
    return await service.list_coupons(db)


@router.post("/coupons", response_model=CouponOut, status_code=status.HTTP_201_CREATED)
async def create_coupon(body: CouponCreateIn, db: DbSession, _: AdminUser) -> CouponOut:
    return await service.create_coupon(db, body)


@router.post("/inventory/adjust", response_model=VariantStockOut)
async def adjust_inventory(
    body: InventoryAdjustIn, db: DbSession, admin: AdminUser
) -> VariantStockOut:
    return await service.adjust_inventory(db, body.variant_id, body.delta, body.note, admin.id)


@router.get("/notifications", response_model=Page[dict], summary="Recent notifications")
async def list_notifications(db: DbSession, _: AdminUser, page: Paging) -> Page[dict]:
    from app.modules.notifications import service as notifications_service

    return await notifications_service.list_notifications(db, page)


@router.post("/uploads", summary="Upload an image")
async def upload_image(_: AdminUser, file: Annotated[UploadFile, File()]) -> dict[str, str]:
    return await save_upload(file)

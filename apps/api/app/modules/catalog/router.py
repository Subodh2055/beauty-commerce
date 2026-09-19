from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.catalog import service
from app.modules.catalog.schemas import (
    BrandOut,
    CategoryOut,
    CategoryTree,
    ProductDetail,
    ProductFacets,
    ProductFilters,
    ProductSummary,
)
from app.shared.pagination import Page, PageParams, page_params

DbSession = Annotated[AsyncSession, Depends(get_db)]
Filters = Annotated[ProductFilters, Query()]
Paging = Annotated[PageParams, Depends(page_params)]

products_router = APIRouter()
categories_router = APIRouter()
brands_router = APIRouter()


@products_router.get("", response_model=Page[ProductSummary], summary="List published products")
async def list_products(db: DbSession, filters: Filters, page: Paging) -> Page[ProductSummary]:
    return await service.list_products(db, filters, page)


@products_router.get("/facets", response_model=ProductFacets, summary="Filter counts")
async def product_facets(db: DbSession, filters: Filters) -> ProductFacets:
    return await service.product_facets(db, filters)


@products_router.get("/{slug}", response_model=ProductDetail, summary="Product detail")
async def get_product(db: DbSession, slug: str) -> ProductDetail:
    return await service.get_product(db, slug)


@products_router.get(
    "/{slug}/related", response_model=list[ProductSummary], summary="Related products"
)
async def related_products(db: DbSession, slug: str) -> list[ProductSummary]:
    return await service.related_products(db, slug)


@categories_router.get("", response_model=list[CategoryTree], summary="Category tree")
async def category_tree(db: DbSession) -> list[CategoryTree]:
    return await service.category_tree(db)


@categories_router.get("/{slug}", response_model=CategoryOut, summary="Category detail")
async def get_category(db: DbSession, slug: str) -> CategoryOut:
    return await service.get_category(db, slug)


@brands_router.get("", response_model=list[BrandOut], summary="List brands")
async def list_brands(db: DbSession) -> list[BrandOut]:
    return await service.list_brands(db)


@brands_router.get("/{slug}", response_model=BrandOut, summary="Brand detail")
async def get_brand(db: DbSession, slug: str) -> BrandOut:
    return await service.get_brand(db, slug)

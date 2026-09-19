import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SortOption = Literal["newest", "price_asc", "price_desc", "name", "rating", "featured"]


class _Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CategoryOut(_Orm):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    parent_id: uuid.UUID | None = None
    sort_order: int


class CategoryTree(CategoryOut):
    children: list["CategoryTree"] = Field(default_factory=list)


class BrandOut(_Orm):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    logo_url: str | None = None
    country: str | None = None


class ProductImageOut(_Orm):
    id: uuid.UUID
    url: str
    alt: str | None = None
    sort_order: int
    is_primary: bool


class ProductVariantOut(_Orm):
    id: uuid.UUID
    sku: str
    name: str
    options: dict[str, Any]
    price: Decimal
    compare_at_price: Decimal | None = None
    stock_quantity: int
    is_default: bool
    sort_order: int


class ProductSummary(_Orm):
    """Card-sized representation for listings."""

    id: uuid.UUID
    sku: str
    name: str
    slug: str
    short_description: str | None = None
    product_type: str
    base_price: Decimal
    compare_at_price: Decimal | None = None
    currency: str
    is_featured: bool
    rating_avg: Decimal
    rating_count: int
    brand: BrandOut | None = None
    category: CategoryOut | None = None
    primary_image: ProductImageOut | None = None
    in_stock: bool
    tags: list[str]


class ProductDetail(ProductSummary):
    description: str | None = None
    tax_rate: Decimal
    attributes: dict[str, Any]
    images: list[ProductImageOut]
    variants: list[ProductVariantOut]
    published_at: datetime | None = None


class ProductFilters(BaseModel):
    q: str | None = None
    category: str | None = None
    brand: str | None = None
    product_type: str | None = None
    min_price: Decimal | None = Field(default=None, ge=0)
    max_price: Decimal | None = Field(default=None, ge=0)
    featured: bool | None = None
    in_stock: bool | None = None
    sort: SortOption = "newest"


class FacetValue(BaseModel):
    slug: str
    name: str
    count: int


class ProductFacets(BaseModel):
    categories: list[FacetValue]
    brands: list[FacetValue]
    product_types: list[FacetValue]
    price_min: Decimal | None = None
    price_max: Decimal | None = None

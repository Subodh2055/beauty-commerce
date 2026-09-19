import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.shared.enums import OrderStatus, ProductStatus


class AdminStats(BaseModel):
    orders_total: int
    orders_open: int
    revenue_total: Decimal
    products_total: int
    products_published: int
    low_stock_variants: int
    customers_total: int


class AdminOrderRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str
    status: str
    payment_method: str
    payment_status: str
    total: Decimal
    currency: str
    customer_email: str | None = None
    item_count: int
    created_at: datetime


class OrderStatusUpdateIn(BaseModel):
    status: OrderStatus
    note: str | None = Field(default=None, max_length=255)


class AdminProductRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    sku: str
    status: str
    is_featured: bool
    base_price: Decimal
    currency: str
    product_type: str
    brand_name: str | None = None
    total_stock: int
    rating_avg: Decimal
    rating_count: int


class ProductUpdateIn(BaseModel):
    """Quick moderation toggle (status / featured) — used by the list view."""

    status: ProductStatus | None = None
    is_featured: bool | None = None


# --- Full product create / edit ---------------------------------------------


class AdminVariantIn(BaseModel):
    id: uuid.UUID | None = None  # present = update existing, absent = create new
    name: str = Field(min_length=1, max_length=120)
    sku: str | None = Field(default=None, max_length=64)  # auto-generated if omitted
    options: dict[str, str] = Field(default_factory=dict)
    price: Decimal = Field(gt=0)
    compare_at_price: Decimal | None = Field(default=None, gt=0)
    stock_quantity: int = Field(default=0, ge=0)
    is_default: bool = False
    sort_order: int = 0


class AdminImageIn(BaseModel):
    id: uuid.UUID | None = None
    url: str = Field(min_length=1, max_length=500)
    alt: str | None = Field(default=None, max_length=200)
    is_primary: bool = False
    sort_order: int = 0


class ProductWriteIn(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=220)  # slugified from name if omitted
    short_description: str | None = Field(default=None, max_length=300)
    description: str | None = None
    product_type: str = Field(min_length=1, max_length=40)
    brand_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    base_price: Decimal = Field(gt=0)
    compare_at_price: Decimal | None = Field(default=None, gt=0)
    currency: str = Field(default="NPR", min_length=3, max_length=3)
    tax_rate: Decimal = Field(default=Decimal("13.00"), ge=0, le=100)
    status: ProductStatus = ProductStatus.DRAFT
    is_featured: bool = False
    attributes: dict = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    variants: list[AdminVariantIn] = Field(min_length=1)
    images: list[AdminImageIn] = Field(default_factory=list)


class AdminVariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sku: str
    options: dict
    price: Decimal
    compare_at_price: Decimal | None = None
    stock_quantity: int
    is_default: bool
    sort_order: int


class AdminImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    alt: str | None = None
    is_primary: bool
    sort_order: int


class AdminProductDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sku: str
    name: str
    slug: str
    short_description: str | None = None
    description: str | None = None
    product_type: str
    brand_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    base_price: Decimal
    compare_at_price: Decimal | None = None
    currency: str
    tax_rate: Decimal
    status: str
    is_featured: bool
    attributes: dict
    tags: list[str]
    variants: list[AdminVariantOut]
    images: list[AdminImageOut]


class OptionOut(BaseModel):
    id: uuid.UUID
    name: str


# --- Brand admin ------------------------------------------------------------


class AdminBrandRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    logo_url: str | None = None
    country: str | None = None
    is_active: bool
    product_count: int = 0


class BrandWriteIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=140)
    description: str | None = Field(default=None, max_length=2000)
    logo_url: str | None = Field(default=None, max_length=500)
    country: str | None = Field(default=None, min_length=2, max_length=2)
    is_active: bool = True


# --- Category admin ---------------------------------------------------------


class AdminCategoryRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    parent_id: uuid.UUID | None = None
    sort_order: int
    is_active: bool
    product_count: int = 0


class CategoryWriteIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=140)
    description: str | None = Field(default=None, max_length=2000)
    image_url: str | None = Field(default=None, max_length=500)
    parent_id: uuid.UUID | None = None
    sort_order: int = 0
    is_active: bool = True


class InventoryAdjustIn(BaseModel):
    variant_id: uuid.UUID
    delta: int
    note: str | None = Field(default=None, max_length=255)

    @field_validator("delta")
    @classmethod
    def _nonzero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("delta must be non-zero")
        return v


class VariantStockOut(BaseModel):
    id: uuid.UUID
    sku: str
    name: str
    stock_quantity: int

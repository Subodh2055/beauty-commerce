import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.payouts.schemas import EarningsSummary


class VendorApplyIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    logo_url: str | None = Field(default=None, max_length=500)
    contact_email: EmailStr
    contact_phone: str | None = Field(default=None, min_length=5, max_length=30)
    business_registration_no: str | None = Field(default=None, max_length=60)
    tax_id: str | None = Field(default=None, max_length=60)
    payout_details: str | None = Field(default=None, max_length=2000)


class VendorUpdateIn(BaseModel):
    """What a vendor may change about themselves. Name/slug changes go through
    support so storefront links and brand reputation stay stable."""

    description: str | None = Field(default=None, max_length=5000)
    logo_url: str | None = Field(default=None, max_length=500)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, min_length=5, max_length=30)
    payout_details: str | None = Field(default=None, max_length=2000)


class VendorOut(BaseModel):
    """Full profile: for the vendor themselves and for admins."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    logo_url: str | None = None
    contact_email: str
    contact_phone: str | None = None
    business_registration_no: str | None = None
    tax_id: str | None = None
    payout_details: str | None = None
    status: str
    status_reason: str | None = None
    reviewed_at: datetime | None = None
    commission_rate: Decimal | None = None
    created_at: datetime


class VendorPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    logo_url: str | None = None


class VendorDecisionIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class VendorReasonIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class CommissionIn(BaseModel):
    # NULL → use the platform default commission.
    commission_rate: Decimal | None = Field(default=None, ge=0, le=100)


class VendorProductRow(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    sku: str
    status: str
    rejection_reason: str | None = None
    base_price: Decimal
    currency: str
    total_stock: int
    variant_count: int = 0
    product_type: str | None = None
    image_url: str | None = None
    updated_at: datetime


class StockSetIn(BaseModel):
    stock_quantity: int = Field(ge=0, le=1_000_000)
    note: str | None = Field(default=None, max_length=255)


class StockOut(BaseModel):
    variant_id: uuid.UUID
    sku: str
    stock_quantity: int


class VendorSummary(BaseModel):
    vendor: VendorOut
    products_by_status: dict[str, int]
    orders_to_ship: int
    earnings: EarningsSummary


VendorProductSort = Literal[
    "updated",
    "updated_asc",
    "name",
    "name_desc",
    "price_asc",
    "price_desc",
    "stock_asc",
    "stock_desc",
]


class BulkProductIn(BaseModel):
    product_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    action: Literal["submit", "archive", "delete"]


class BulkFailure(BaseModel):
    id: uuid.UUID
    reason: str


class BulkProductResult(BaseModel):
    """Per-product outcome: one bad row never blocks the rest."""

    done: list[uuid.UUID]
    failed: list[BulkFailure]


# --- Reports ----------------------------------------------------------------------


class SalesPoint(BaseModel):
    date: date
    revenue: Decimal  # gross: what customers paid for this vendor's lines
    earnings: Decimal  # after commission
    orders: int
    units: int


class SalesTotals(BaseModel):
    revenue: Decimal
    earnings: Decimal
    orders: int
    units: int
    avg_order_value: Decimal


class TopProduct(BaseModel):
    product_id: uuid.UUID
    name: str
    slug: str | None = None
    image_url: str | None = None
    units: int
    revenue: Decimal


class LowStockItem(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    variant_name: str
    sku: str
    stock_quantity: int


class VendorAnalytics(BaseModel):
    days: int
    currency: str
    series: list[SalesPoint]  # one point per day, zero-filled, oldest first
    totals: SalesTotals
    previous: SalesTotals  # the same-length period just before, for deltas
    top_products: list[TopProduct]
    low_stock: list[LowStockItem]
    low_stock_threshold: int


class InventoryRow(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_status: str
    variant_name: str
    sku: str
    size_ml: Decimal | None = None
    price: Decimal
    stock_quantity: int
    low: bool


class ReviewedProductRef(BaseModel):
    name: str
    slug: str


class VendorReviewRow(BaseModel):
    id: uuid.UUID
    rating: int
    title: str | None = None
    body: str | None = None
    author: str  # "Asha S." — first name + initial only
    is_verified_purchase: bool
    created_at: datetime
    product: ReviewedProductRef


class VendorReviewList(BaseModel):
    items: list[VendorReviewRow]
    total: int
    page: int
    size: int
    average: Decimal
    count: int
    stars: dict[str, int]  # "1".."5"

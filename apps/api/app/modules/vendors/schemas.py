import uuid
from datetime import datetime
from decimal import Decimal

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

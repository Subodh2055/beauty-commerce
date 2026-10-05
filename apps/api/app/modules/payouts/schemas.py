import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PayoutLine(BaseModel):
    vendor_order_id: uuid.UUID
    order_number: str
    delivered_at: datetime | None
    subtotal: Decimal
    commission_rate: Decimal | None
    commission_amount: Decimal
    vendor_earnings: Decimal


class PayoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    vendor_id: uuid.UUID
    status: str
    currency: str
    gross_amount: Decimal
    commission_amount: Decimal
    net_amount: Decimal
    order_count: int
    paid_at: datetime | None = None
    reference: str | None = None
    note: str | None = None
    created_at: datetime


class PayoutDetail(PayoutOut):
    lines: list[PayoutLine]


class VendorBalance(BaseModel):
    vendor_id: uuid.UUID
    vendor_name: str
    eligible_orders: int
    gross_amount: Decimal
    commission_amount: Decimal
    net_amount: Decimal


class EarningsSummary(BaseModel):
    """A vendor's money position, for the portal dashboard."""

    ready_for_payout: Decimal  # delivered + paid, not yet in a payout
    in_progress: Decimal  # sold, not yet delivered/paid
    in_pending_payouts: Decimal
    paid_out: Decimal


class PayoutCreateIn(BaseModel):
    vendor_id: uuid.UUID
    note: str | None = Field(default=None, max_length=500)


class PayoutPaidIn(BaseModel):
    reference: str = Field(min_length=1, max_length=120)

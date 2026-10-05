import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

ReturnReason = Literal["DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED", "CHANGED_MIND", "OTHER"]
RefundMethod = Literal["ORIGINAL", "MANUAL"]


class ReturnItemIn(BaseModel):
    order_item_id: uuid.UUID
    quantity: int = Field(ge=1, le=100)


class ReturnCreateIn(BaseModel):
    reason: ReturnReason
    details: str | None = Field(default=None, max_length=2000)
    items: list[ReturnItemIn] = Field(min_length=1, max_length=50)


class ReturnItemOut(BaseModel):
    order_item_id: uuid.UUID
    product_name: str
    variant_name: str
    sku: str
    image_url: str | None = None
    unit_price: Decimal
    quantity: int


class RefundOut(BaseModel):
    id: uuid.UUID
    return_id: uuid.UUID | None = None
    amount: Decimal
    method: str
    reference: str | None = None
    note: str | None = None
    created_at: datetime


class ReturnOut(BaseModel):
    id: uuid.UUID
    reference: str
    order_id: uuid.UUID
    order_number: str
    status: str
    reason: str
    details: str | None = None
    items: list[ReturnItemOut]
    requested_amount: Decimal
    refunded_amount: Decimal
    decision_note: str | None = None
    decided_at: datetime | None = None
    received_at: datetime | None = None
    restocked: bool
    refunds: list[RefundOut] = []
    created_at: datetime
    updated_at: datetime


class AdminReturnOut(ReturnOut):
    customer_email: str | None = None
    customer_name: str | None = None
    order_total: Decimal
    currency: str
    # What can still be refunded on the whole order (all returns and refunds).
    order_refundable: Decimal
    payment_method: str


class ReturnDecisionIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class ReturnRejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ReturnReceiveIn(BaseModel):
    restock: bool = True
    note: str | None = Field(default=None, max_length=500)


class RefundIn(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    method: RefundMethod = "ORIGINAL"
    reference: str | None = Field(default=None, max_length=128)
    note: str | None = Field(default=None, max_length=500)

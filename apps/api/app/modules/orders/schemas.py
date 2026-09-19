import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import PaymentMethod


class ShippingAddressIn(BaseModel):
    recipient_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=5, max_length=30)
    line1: str = Field(min_length=1, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=1, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str = Field(default="NP", min_length=2, max_length=2)


class CheckoutItemIn(BaseModel):
    variant_id: uuid.UUID
    quantity: int = Field(ge=1, le=99)


class CheckoutIn(BaseModel):
    items: list[CheckoutItemIn] = Field(min_length=1)
    shipping_address: ShippingAddressIn
    payment_method: PaymentMethod = PaymentMethod.COD
    customer_note: str | None = Field(default=None, max_length=1000)
    coupon_code: str | None = Field(default=None, max_length=40)


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_name: str
    variant_name: str
    sku: str
    image_url: str | None = None
    slug: str | None = None
    unit_price: Decimal
    quantity: int
    line_total: Decimal


class OrderStatusEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: str
    note: str | None = None
    created_at: datetime


class OrderSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str
    status: str
    payment_method: str
    payment_status: str
    total: Decimal
    currency: str
    created_at: datetime
    item_count: int


class OrderDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_number: str
    status: str
    subtotal: Decimal
    shipping_fee: Decimal
    tax_total: Decimal
    discount_total: Decimal
    total: Decimal
    currency: str
    payment_method: str
    payment_status: str
    ship_recipient: str
    ship_phone: str
    ship_line1: str
    ship_line2: str | None = None
    ship_city: str
    ship_state: str | None = None
    ship_postal_code: str | None = None
    ship_country: str
    customer_note: str | None = None
    created_at: datetime
    items: list[OrderItemOut]
    history: list[OrderStatusEventOut]


class CheckoutResult(BaseModel):
    order: OrderDetail
    # Set for online methods that need a redirect; null for COD.
    payment_redirect_url: str | None = None
    message: str

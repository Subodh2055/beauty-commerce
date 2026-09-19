import uuid
from decimal import Decimal

from pydantic import BaseModel, Field


class CartItemIn(BaseModel):
    variant_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=99)


class CartSetQtyIn(BaseModel):
    quantity: int = Field(ge=0, le=99)  # 0 removes the line


class CartMergeIn(BaseModel):
    items: list[CartItemIn] = Field(default_factory=list, max_length=100)


class CartLineOut(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID
    slug: str
    name: str
    brand: str | None = None
    variant_name: str
    unit_price: Decimal
    currency: str
    image_url: str | None = None
    quantity: int
    stock_quantity: int
    in_stock: bool
    line_total: Decimal


class CartOut(BaseModel):
    items: list[CartLineOut]
    count: int  # total units
    subtotal: Decimal
    currency: str = "NPR"

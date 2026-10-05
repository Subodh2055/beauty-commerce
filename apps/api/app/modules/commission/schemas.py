import uuid
from decimal import Decimal

from pydantic import BaseModel, Field


class CategoryRule(BaseModel):
    id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None = None
    depth: int
    rate: Decimal | None = None  # own override; None = inherits
    effective_rate: Decimal  # what a product here pays, before any vendor override
    inherited_from: str | None = None  # category name, or None when global/own
    product_count: int


class VendorRule(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    rate: Decimal | None = None  # None = category/global rules apply


class CommissionRules(BaseModel):
    """Precedence for each order line: vendor override → category (nearest
    ancestor with a rate) → global default. Snapshotted at checkout."""

    global_rate: Decimal
    categories: list[CategoryRule]
    vendors: list[VendorRule]


class RateIn(BaseModel):
    rate: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)


class OptionalRateIn(BaseModel):
    """`null` removes the override."""

    rate: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)

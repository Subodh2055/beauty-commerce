import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import DiscountType


class CouponValidateIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    subtotal: Decimal = Field(ge=0)


class CouponValidateOut(BaseModel):
    code: str
    description: str | None = None
    discount_type: DiscountType
    discount_amount: Decimal
    message: str


class CouponCreateIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    description: str | None = Field(default=None, max_length=255)
    discount_type: DiscountType
    value: Decimal = Field(gt=0)
    min_subtotal: Decimal = Field(default=Decimal("0"), ge=0)
    max_discount: Decimal | None = Field(default=None, gt=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    usage_limit: int | None = Field(default=None, ge=1)
    per_user_limit: int = Field(default=1, ge=1)
    is_active: bool = True


class CouponOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    description: str | None = None
    discount_type: str
    value: Decimal
    min_subtotal: Decimal
    max_discount: Decimal | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    usage_limit: int | None = None
    used_count: int
    per_user_limit: int
    is_active: bool
    created_at: datetime

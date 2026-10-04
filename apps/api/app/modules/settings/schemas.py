from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


class PlatformSettings(BaseModel):
    """Every platform setting with its default. Add a field here to add a setting."""

    default_commission_rate: Decimal = Field(
        default=Decimal("15.00"), ge=0, le=100, description="Percent kept by the platform"
    )
    free_shipping_threshold: Decimal = Field(default=Decimal("5000"), ge=0)
    shipping_fee: Decimal = Field(default=Decimal("150"), ge=0)
    min_payout_amount: Decimal = Field(
        default=Decimal("1000"), ge=0, description="Vendors below this balance roll over"
    )
    vendor_applications_open: bool = True
    support_email: EmailStr = "support@example.com"


class PlatformSettingsUpdate(BaseModel):
    """PATCH body: only the fields sent are changed."""

    default_commission_rate: Decimal | None = Field(default=None, ge=0, le=100)
    free_shipping_threshold: Decimal | None = Field(default=None, ge=0)
    shipping_fee: Decimal | None = Field(default=None, ge=0)
    min_payout_amount: Decimal | None = Field(default=None, ge=0)
    vendor_applications_open: bool | None = None
    support_email: EmailStr | None = None


class PublicSettings(BaseModel):
    """The subset the storefront may read without signing in."""

    free_shipping_threshold: Decimal
    shipping_fee: Decimal
    vendor_applications_open: bool
    support_email: str

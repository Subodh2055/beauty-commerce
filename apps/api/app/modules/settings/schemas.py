from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.shared.enums import PaymentMethod


class ShippingZone(BaseModel):
    """Orders shipped to one of `regions` (a city or province, matched without
    case) pay this zone's fee; everything else uses the default fee."""

    name: str = Field(min_length=1, max_length=60)
    regions: list[str] = Field(min_length=1, max_length=200)
    fee: Decimal = Field(ge=0)
    # None: the platform-wide free-shipping threshold applies.
    free_threshold: Decimal | None = Field(default=None, ge=0)
    eta_days_min: int = Field(default=2, ge=0, le=60)
    eta_days_max: int = Field(default=5, ge=0, le=60)

    @field_validator("regions")
    @classmethod
    def _clean_regions(cls, v: list[str]) -> list[str]:
        cleaned = [r.strip() for r in v if r.strip()]
        if not cleaned:
            raise ValueError("Add at least one city or province")
        return cleaned

    @model_validator(mode="after")
    def _eta_order(self) -> "ShippingZone":
        if self.eta_days_max < self.eta_days_min:
            raise ValueError("Maximum delivery days must be at least the minimum")
        return self


class PaymentSettings(BaseModel):
    # Methods shoppers may choose. An online method also needs its provider
    # configured on the server before it actually becomes available.
    enabled_methods: list[PaymentMethod] = Field(default_factory=lambda: [m for m in PaymentMethod])
    # Cash on delivery is refused above this order total (None = no cap).
    cod_max_total: Decimal | None = Field(default=None, ge=0)


class TaxSettings(BaseModel):
    label: str = Field(default="VAT", min_length=1, max_length=20)
    # True: catalogue prices already include tax, so it is reported, not added.
    prices_include_tax: bool = True
    registration_number: str | None = Field(default=None, max_length=40)


class DisplayCurrency(BaseModel):
    code: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    symbol: str = Field(min_length=1, max_length=6)
    rate: Decimal = Field(gt=0, description="Units of this currency per 1 base unit")


class EmailTemplate(BaseModel):
    """Override for one notification email. `{{name}}` placeholders are filled
    from the event; unknown ones are left as typed."""

    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    enabled: bool = True


EmailEvent = Literal["order.placed", "order.status_changed"]
EMAIL_TEMPLATE_VARIABLES: dict[str, list[str]] = {
    "order.placed": ["order_number", "recipient", "total", "payment_method", "items"],
    "order.status_changed": ["order_number", "recipient", "status", "status_message", "total"],
}


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
    # Days after delivery a customer may ask to return items.
    return_window_days: int = Field(default=14, ge=0, le=365)
    shipping_zones: list[ShippingZone] = Field(default_factory=list, max_length=50)
    payments: PaymentSettings = Field(default_factory=PaymentSettings)
    taxes: TaxSettings = Field(default_factory=TaxSettings)
    # Amounts are stored and charged in the base currency.
    base_currency: str = Field(default="NPR", pattern=r"^[A-Z]{3}$")
    display_currencies: list[DisplayCurrency] = Field(default_factory=list, max_length=20)
    email_templates: dict[EmailEvent, EmailTemplate] = Field(default_factory=dict)


class PlatformSettingsUpdate(BaseModel):
    """PATCH body: only the fields sent are changed (lists and groups are
    replaced whole)."""

    default_commission_rate: Decimal | None = Field(default=None, ge=0, le=100)
    free_shipping_threshold: Decimal | None = Field(default=None, ge=0)
    shipping_fee: Decimal | None = Field(default=None, ge=0)
    min_payout_amount: Decimal | None = Field(default=None, ge=0)
    vendor_applications_open: bool | None = None
    support_email: EmailStr | None = None
    return_window_days: int | None = Field(default=None, ge=0, le=365)
    shipping_zones: list[ShippingZone] | None = Field(default=None, max_length=50)
    payments: PaymentSettings | None = None
    taxes: TaxSettings | None = None
    base_currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    display_currencies: list[DisplayCurrency] | None = Field(default=None, max_length=20)
    email_templates: dict[EmailEvent, EmailTemplate] | None = None


class PublicSettings(BaseModel):
    """The subset the storefront may read without signing in."""

    free_shipping_threshold: Decimal
    shipping_fee: Decimal
    vendor_applications_open: bool
    support_email: str
    base_currency: str = "NPR"
    shipping_zones: list[ShippingZone] = []
    display_currencies: list[DisplayCurrency] = []
    prices_include_tax: bool = True
    tax_label: str = "VAT"

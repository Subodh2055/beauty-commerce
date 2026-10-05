from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.settings import repository as repo
from app.modules.settings.schemas import (
    PlatformSettings,
    PlatformSettingsUpdate,
    PublicSettings,
    ShippingZone,
)


async def get_settings(db: AsyncSession) -> PlatformSettings:
    """Defaults overlaid with stored values. Unknown stored keys are ignored, so
    removing a field from the schema never breaks reads."""
    stored = await repo.all_values(db)
    known = {k: v for k, v in stored.items() if k in PlatformSettings.model_fields}
    return PlatformSettings.model_validate({**PlatformSettings().model_dump(), **known})


async def update_settings(db: AsyncSession, body: PlatformSettingsUpdate) -> PlatformSettings:
    changes = body.model_dump(exclude_unset=True, exclude_none=True, mode="json")
    # Validate the merged result before writing anything.
    merged = PlatformSettings.model_validate({**(await get_settings(db)).model_dump(), **changes})
    for key, value in changes.items():
        await repo.upsert(db, key, value)
    await db.commit()
    return merged


async def public_settings(db: AsyncSession) -> PublicSettings:
    s = await get_settings(db)
    return PublicSettings(
        free_shipping_threshold=s.free_shipping_threshold,
        shipping_fee=s.shipping_fee,
        vendor_applications_open=s.vendor_applications_open,
        support_email=str(s.support_email),
        base_currency=s.base_currency,
        shipping_zones=s.shipping_zones,
        display_currencies=s.display_currencies,
        prices_include_tax=s.taxes.prices_include_tax,
        tax_label=s.taxes.label,
    )


def zone_for(s: PlatformSettings, city: str | None, state: str | None) -> ShippingZone | None:
    """First zone listing the destination city or province (case-insensitive)."""
    wanted = {x.strip().casefold() for x in (city, state) if x and x.strip()}
    for zone in s.shipping_zones:
        if wanted & {r.casefold() for r in zone.regions}:
            return zone
    return None


def shipping_fee_for(
    s: PlatformSettings, subtotal: Decimal, city: str | None, state: str | None
) -> Decimal:
    zone = zone_for(s, city, state)
    fee = zone.fee if zone else s.shipping_fee
    threshold = (
        zone.free_threshold
        if zone and zone.free_threshold is not None
        else s.free_shipping_threshold
    )
    return Decimal("0") if subtotal >= threshold else fee

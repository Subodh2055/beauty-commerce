from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.settings import repository as repo
from app.modules.settings.schemas import PlatformSettings, PlatformSettingsUpdate, PublicSettings


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
    )

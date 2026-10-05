from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.settings.models import PlatformSetting


async def all_values(db: AsyncSession) -> dict[str, object]:
    rows = await db.scalars(select(PlatformSetting))
    return {r.key: r.value for r in rows}


async def upsert(db: AsyncSession, key: str, value: object) -> None:
    row = await db.get(PlatformSetting, key)
    if row is None:
        db.add(PlatformSetting(key=key, value=value))
    else:
        row.value = value

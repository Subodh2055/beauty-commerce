import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.media.models import MediaAsset
from app.shared.enums import MediaStatus


async def get_for_update(db: AsyncSession, asset_id: uuid.UUID) -> MediaAsset | None:
    return await db.scalar(
        select(MediaAsset).where(MediaAsset.id == asset_id).with_for_update(skip_locked=True)
    )


async def stale_pending_ids(db: AsyncSession, older_than: datetime) -> list[uuid.UUID]:
    stmt = select(MediaAsset.id).where(
        MediaAsset.status == MediaStatus.PENDING, MediaAsset.created_at < older_than
    )
    return list(await db.scalars(stmt))

from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cms.models import Banner


async def live_banners(db: AsyncSession, placement: str, now: datetime) -> list[Banner]:
    stmt = (
        select(Banner)
        .where(
            Banner.placement == placement,
            Banner.is_active,
            or_(Banner.starts_at.is_(None), Banner.starts_at <= now),
            or_(Banner.ends_at.is_(None), Banner.ends_at > now),
        )
        .order_by(Banner.sort_order, Banner.created_at)
    )
    return list((await db.scalars(stmt)).all())


async def all_banners(db: AsyncSession, placement: str | None) -> list[Banner]:
    stmt = select(Banner).order_by(Banner.placement, Banner.sort_order, Banner.created_at)
    if placement:
        stmt = stmt.where(Banner.placement == placement)
    return list((await db.scalars(stmt)).all())

import uuid
from datetime import UTC, datetime

from pydantic import TypeAdapter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.core.exceptions import NotFoundError
from app.modules.cms import repository as repo
from app.modules.cms.models import Banner
from app.modules.cms.schemas import BannerAdminOut, BannerOut, BannerWriteIn

CACHE_NS = "cms"
# Scheduled banners must appear/disappear near their window edges, so keep the
# public cache short even though writes invalidate it immediately.
CACHE_TTL = 60
_BANNERS = TypeAdapter(list[BannerOut])


async def live_banners(db: AsyncSession, placement: str) -> list[BannerOut]:
    async def load() -> list[BannerOut]:
        rows = await repo.live_banners(db, placement, datetime.now(UTC))
        return [BannerOut.model_validate(b) for b in rows]

    key = cache.make_key("banners", placement)
    return await cache.get_or_load(CACHE_NS, key, _BANNERS, load, ttl=CACHE_TTL)


async def list_all(db: AsyncSession, placement: str | None) -> list[BannerAdminOut]:
    return [BannerAdminOut.model_validate(b) for b in await repo.all_banners(db, placement)]


def _apply(banner: Banner, body: BannerWriteIn) -> None:
    for field, value in body.model_dump().items():
        setattr(banner, field, value)


async def create(db: AsyncSession, body: BannerWriteIn) -> BannerAdminOut:
    banner = Banner()
    _apply(banner, body)
    db.add(banner)
    await db.commit()
    await db.refresh(banner)
    await cache.invalidate(CACHE_NS)
    return BannerAdminOut.model_validate(banner)


async def update(db: AsyncSession, banner_id: uuid.UUID, body: BannerWriteIn) -> BannerAdminOut:
    banner = await db.get(Banner, banner_id)
    if banner is None:
        raise NotFoundError("Banner not found")
    _apply(banner, body)
    await db.commit()
    await db.refresh(banner)
    await cache.invalidate(CACHE_NS)
    return BannerAdminOut.model_validate(banner)


async def delete(db: AsyncSession, banner_id: uuid.UUID) -> None:
    banner = await db.get(Banner, banner_id)
    if banner is None:
        raise NotFoundError("Banner not found")
    await db.delete(banner)
    await db.commit()
    await cache.invalidate(CACHE_NS)

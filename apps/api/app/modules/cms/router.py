import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import require_permission
from app.modules.cms import service
from app.modules.cms.schemas import BannerAdminOut, BannerOut, BannerWriteIn
from app.shared.enums import Permission

DbSession = Annotated[AsyncSession, Depends(get_db)]
Placement = Annotated[str, Query(pattern=r"^[a-z][a-z0-9_]{1,29}$")]

router = APIRouter()
admin_router = APIRouter(dependencies=[Audited])


@router.get("/banners", response_model=list[BannerOut], summary="Live banners for a placement")
async def live_banners(db: DbSession, placement: Placement = "home_hero") -> list[BannerOut]:
    return await service.live_banners(db, placement)


@admin_router.get(
    "",
    response_model=list[BannerAdminOut],
    dependencies=[Depends(require_permission(Permission.CMS_VIEW))],
)
async def list_banners(
    db: DbSession, placement: str | None = Query(default=None, max_length=30)
) -> list[BannerAdminOut]:
    return await service.list_all(db, placement)


@admin_router.post(
    "",
    response_model=BannerAdminOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.CMS_CREATE))],
)
async def create_banner(body: BannerWriteIn, db: DbSession) -> BannerAdminOut:
    return await service.create(db, body)


@admin_router.put(
    "/{banner_id}",
    response_model=BannerAdminOut,
    dependencies=[Depends(require_permission(Permission.CMS_EDIT))],
)
async def update_banner(banner_id: uuid.UUID, body: BannerWriteIn, db: DbSession) -> BannerAdminOut:
    return await service.update(db, banner_id, body)


@admin_router.delete(
    "/{banner_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.CMS_DELETE))],
)
async def delete_banner(banner_id: uuid.UUID, db: DbSession) -> None:
    await service.delete(db, banner_id)

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import require_permission
from app.modules.settings import service
from app.modules.settings.schemas import PlatformSettings, PlatformSettingsUpdate, PublicSettings
from app.shared.enums import Permission

DbSession = Annotated[AsyncSession, Depends(get_db)]

public_router = APIRouter()
admin_router = APIRouter(dependencies=[Audited])


@public_router.get("/public", response_model=PublicSettings, summary="Storefront settings")
async def public_settings(db: DbSession) -> PublicSettings:
    return await service.public_settings(db)


@admin_router.get(
    "",
    response_model=PlatformSettings,
    summary="All platform settings",
    dependencies=[Depends(require_permission(Permission.SETTINGS_VIEW))],
)
async def get_settings(db: DbSession) -> PlatformSettings:
    return await service.get_settings(db)


@admin_router.patch(
    "",
    response_model=PlatformSettings,
    summary="Change platform settings",
    dependencies=[Depends(require_permission(Permission.SETTINGS_EDIT))],
)
async def update_settings(body: PlatformSettingsUpdate, db: DbSession) -> PlatformSettings:
    return await service.update_settings(db, body)

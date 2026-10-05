"""Uploads themselves are posted to `/admin/uploads` or `/vendor/uploads` (those
routers own the permission checks). This router lets the uploader poll an asset
until its WebP renditions are ready."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.modules.auth.dependencies import CurrentUser
from app.modules.media import service
from app.modules.media.models import MediaAsset
from app.modules.media.schemas import MediaAssetOut
from app.shared.enums import Permission

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/{asset_id}", response_model=MediaAssetOut, summary="Upload status + renditions")
async def get_asset(asset_id: uuid.UUID, db: DbSession, user: CurrentUser) -> MediaAssetOut:
    asset = await db.get(MediaAsset, asset_id)
    # Someone else's upload is "not found" unless you manage the catalog.
    if asset is None or (
        asset.owner_id != user.id and not user.has_permission(Permission.PRODUCTS_EDIT)
    ):
        raise NotFoundError("Upload not found")
    return service.to_out(asset)

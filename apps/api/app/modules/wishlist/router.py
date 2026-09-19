import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import CurrentUser
from app.modules.catalog.schemas import ProductSummary
from app.modules.wishlist import service
from app.modules.wishlist.schemas import WishlistAddIn, WishlistMergeIn

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[ProductSummary], summary="My wishlist")
async def list_wishlist(db: DbSession, user: CurrentUser) -> list[ProductSummary]:
    return await service.list_items(db, user.id)


@router.post("", response_model=list[ProductSummary], summary="Add to wishlist")
async def add_to_wishlist(
    body: WishlistAddIn, db: DbSession, user: CurrentUser
) -> list[ProductSummary]:
    return await service.add(db, user.id, body.product_id)


@router.post("/merge", response_model=list[ProductSummary], summary="Merge guest wishlist")
async def merge_wishlist(
    body: WishlistMergeIn, db: DbSession, user: CurrentUser
) -> list[ProductSummary]:
    return await service.merge(db, user.id, body.product_ids)


@router.delete("/{product_id}", response_model=list[ProductSummary], summary="Remove from wishlist")
async def remove_from_wishlist(
    product_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> list[ProductSummary]:
    return await service.remove(db, user.id, product_id)

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import CurrentUser
from app.modules.cart import service
from app.modules.cart.schemas import CartItemIn, CartMergeIn, CartOut, CartSetQtyIn

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=CartOut, summary="My cart")
async def get_cart(db: DbSession, user: CurrentUser) -> CartOut:
    return await service.get_cart(db, user.id)


@router.post("", response_model=CartOut, summary="Add to cart")
async def add_to_cart(body: CartItemIn, db: DbSession, user: CurrentUser) -> CartOut:
    return await service.add(db, user.id, body.variant_id, body.quantity)


@router.patch("/{variant_id}", response_model=CartOut, summary="Set line quantity")
async def set_quantity(
    variant_id: uuid.UUID, body: CartSetQtyIn, db: DbSession, user: CurrentUser
) -> CartOut:
    return await service.set_quantity(db, user.id, variant_id, body.quantity)


@router.delete("/{variant_id}", response_model=CartOut, summary="Remove a line")
async def remove(variant_id: uuid.UUID, db: DbSession, user: CurrentUser) -> CartOut:
    return await service.remove(db, user.id, variant_id)


@router.delete("", response_model=CartOut, summary="Clear cart")
async def clear(db: DbSession, user: CurrentUser) -> CartOut:
    return await service.clear(db, user.id)


@router.post("/merge", response_model=CartOut, summary="Merge guest cart")
async def merge(body: CartMergeIn, db: DbSession, user: CurrentUser) -> CartOut:
    return await service.merge(db, user.id, body.items)

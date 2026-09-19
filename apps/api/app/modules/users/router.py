import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import CurrentUser
from app.modules.users import service
from app.modules.users.schemas import AddressIn, AddressOut

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/me/addresses", response_model=list[AddressOut], summary="List my addresses")
async def list_addresses(db: DbSession, user: CurrentUser) -> list[AddressOut]:
    return await service.list_addresses(db, user.id)


@router.post(
    "/me/addresses",
    response_model=AddressOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add an address",
)
async def create_address(body: AddressIn, db: DbSession, user: CurrentUser) -> AddressOut:
    return await service.create_address(db, user.id, body)


@router.put("/me/addresses/{address_id}", response_model=AddressOut, summary="Update an address")
async def update_address(
    address_id: uuid.UUID, body: AddressIn, db: DbSession, user: CurrentUser
) -> AddressOut:
    return await service.update_address(db, user.id, address_id, body)


@router.post(
    "/me/addresses/{address_id}/default",
    response_model=AddressOut,
    summary="Set default address",
)
async def set_default(address_id: uuid.UUID, db: DbSession, user: CurrentUser) -> AddressOut:
    return await service.set_default(db, user.id, address_id)


@router.delete(
    "/me/addresses/{address_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an address",
)
async def delete_address(address_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    await service.delete_address(db, user.id, address_id)

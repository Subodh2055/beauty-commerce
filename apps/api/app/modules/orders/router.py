import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import CurrentUser
from app.modules.orders import service
from app.modules.orders.schemas import CheckoutIn, CheckoutResult, OrderDetail, OrderSummary
from app.shared.pagination import Page, PageParams, page_params

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]
Paging = Annotated[PageParams, Depends(page_params)]


@router.post("", response_model=CheckoutResult, status_code=status.HTTP_201_CREATED)
async def checkout(body: CheckoutIn, db: DbSession, user: CurrentUser) -> CheckoutResult:
    return await service.checkout(db, user.id, user.email, body)


@router.get("", response_model=Page[OrderSummary], summary="List my orders")
async def list_orders(db: DbSession, user: CurrentUser, page: Paging) -> Page[OrderSummary]:
    return await service.list_my_orders(db, user.id, page)


@router.get("/{order_id}", response_model=OrderDetail, summary="My order detail")
async def get_order(order_id: uuid.UUID, db: DbSession, user: CurrentUser) -> OrderDetail:
    return await service.get_my_order(db, user.id, order_id)


@router.post("/{order_id}/cancel", response_model=OrderDetail, summary="Cancel my order")
async def cancel_order(order_id: uuid.UUID, db: DbSession, user: CurrentUser) -> OrderDetail:
    return await service.cancel_my_order(db, user.id, user.email, order_id)

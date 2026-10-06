"""Returns and refunds.

- `router`        /orders/{order_id}/returns, /users/me/returns — the customer's own
- `admin_router`  /admin/returns — review, receive, refund (returns.*, audited)
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.ratelimit import limit
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import CurrentUser, require_permission
from app.modules.returns import service
from app.modules.returns.schemas import (
    AdminReturnOut,
    RefundIn,
    ReturnCreateIn,
    ReturnDecisionIn,
    ReturnOut,
    ReturnReceiveIn,
    ReturnRejectIn,
)
from app.modules.users.models import User
from app.shared.enums import Permission
from app.shared.pagination import Page, PageParams, page_params

router = APIRouter()
mine_router = APIRouter()
admin_router = APIRouter(dependencies=[Audited])

DbSession = Annotated[AsyncSession, Depends(get_db)]
Paging = Annotated[PageParams, Depends(page_params)]
ReturnsView = Annotated[User, Depends(require_permission(Permission.RETURNS_VIEW))]
ReturnsEdit = Annotated[User, Depends(require_permission(Permission.RETURNS_EDIT))]


@router.post(
    "/{order_id}/returns",
    response_model=ReturnOut,
    status_code=status.HTTP_201_CREATED,
    summary="Ask to return items from a delivered order",
    dependencies=[limit("return_request", 10, 3600, by="user")],
)
async def request_return(
    order_id: uuid.UUID, body: ReturnCreateIn, db: DbSession, user: CurrentUser
) -> ReturnOut:
    return await service.request_return(db, user.id, order_id, body)


@mine_router.get("", response_model=list[ReturnOut], summary="My return requests")
async def my_returns(db: DbSession, user: CurrentUser) -> list[ReturnOut]:
    return await service.my_returns(db, user.id)


@admin_router.get("", response_model=Page[AdminReturnOut])
async def list_returns(
    db: DbSession,
    _: ReturnsView,
    page: Paging,
    status: str | None = Query(default=None, max_length=20),
    q: str | None = Query(default=None, max_length=100),
) -> Page[AdminReturnOut]:
    return await service.list_returns(db, page, status, q)


@admin_router.get("/{return_id}", response_model=AdminReturnOut)
async def get_return(return_id: uuid.UUID, db: DbSession, _: ReturnsView) -> AdminReturnOut:
    return await service.get_return(db, return_id)


@admin_router.post("/{return_id}/approve", response_model=AdminReturnOut)
async def approve(
    return_id: uuid.UUID, body: ReturnDecisionIn, db: DbSession, staff: ReturnsEdit
) -> AdminReturnOut:
    return await service.approve(db, return_id, staff.id, body.note)


@admin_router.post("/{return_id}/reject", response_model=AdminReturnOut)
async def reject(
    return_id: uuid.UUID, body: ReturnRejectIn, db: DbSession, staff: ReturnsEdit
) -> AdminReturnOut:
    return await service.reject(db, return_id, staff.id, body.reason)


@admin_router.post("/{return_id}/receive", response_model=AdminReturnOut)
async def receive(
    return_id: uuid.UUID, body: ReturnReceiveIn, db: DbSession, staff: ReturnsEdit
) -> AdminReturnOut:
    return await service.receive(db, return_id, staff.id, body.restock, body.note)


@admin_router.post(
    "/{return_id}/refund",
    response_model=AdminReturnOut,
    summary="Record the refund paid for this return",
)
async def refund(
    return_id: uuid.UUID, body: RefundIn, db: DbSession, staff: ReturnsEdit
) -> AdminReturnOut:
    return await service.refund(db, return_id, staff.id, body)

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import CurrentUser, require_permission
from app.modules.support import service
from app.modules.support.schemas import (
    MessageIn,
    StaffMessageIn,
    StaffTicketDetail,
    TicketCreateIn,
    TicketDetail,
    TicketSummary,
    TicketUpdateIn,
)
from app.modules.users.models import User
from app.shared.enums import Permission
from app.shared.pagination import Page, PageParams, page_params

DbSession = Annotated[AsyncSession, Depends(get_db)]
Paging = Annotated[PageParams, Depends(page_params)]
SupportStaff = Annotated[User, Depends(require_permission(Permission.SUPPORT_MANAGE))]

router = APIRouter()  # /support — the requester's own tickets
admin_router = APIRouter(dependencies=[Audited])  # /admin/support


@router.post("/tickets", response_model=TicketDetail, status_code=status.HTTP_201_CREATED)
async def open_ticket(body: TicketCreateIn, db: DbSession, user: CurrentUser) -> TicketDetail:
    return await service.open_ticket(db, user, body)


@router.get("/tickets", response_model=Page[TicketSummary])
async def my_tickets(db: DbSession, user: CurrentUser, page: Paging) -> Page[TicketSummary]:
    return await service.list_mine(db, user.id, page)


@router.get("/tickets/{ticket_id}", response_model=TicketDetail)
async def my_ticket(ticket_id: uuid.UUID, db: DbSession, user: CurrentUser) -> TicketDetail:
    return await service.get_mine(db, user.id, ticket_id)


@router.post("/tickets/{ticket_id}/messages", response_model=TicketDetail)
async def reply(
    ticket_id: uuid.UUID, body: MessageIn, db: DbSession, user: CurrentUser
) -> TicketDetail:
    return await service.reply_mine(db, user.id, ticket_id, body.body)


@router.post("/tickets/{ticket_id}/close", response_model=TicketDetail)
async def close(ticket_id: uuid.UUID, db: DbSession, user: CurrentUser) -> TicketDetail:
    return await service.close_mine(db, user.id, ticket_id)


@admin_router.get("/tickets", response_model=Page[TicketSummary])
async def all_tickets(
    db: DbSession,
    _: SupportStaff,
    page: Paging,
    status: str | None = Query(default=None),
    assigned_to: Annotated[uuid.UUID | None, Query()] = None,
) -> Page[TicketSummary]:
    return await service.list_all(db, page, status=status, assigned_to=assigned_to)


@admin_router.get("/tickets/{ticket_id}", response_model=StaffTicketDetail)
async def staff_ticket(ticket_id: uuid.UUID, db: DbSession, _: SupportStaff) -> StaffTicketDetail:
    return await service.get_staff(db, ticket_id)


@admin_router.post("/tickets/{ticket_id}/messages", response_model=StaffTicketDetail)
async def staff_reply(
    ticket_id: uuid.UUID, body: StaffMessageIn, db: DbSession, staff: SupportStaff
) -> StaffTicketDetail:
    return await service.reply_staff(db, staff.id, ticket_id, body)


@admin_router.patch("/tickets/{ticket_id}", response_model=StaffTicketDetail)
async def staff_update(
    ticket_id: uuid.UUID, body: TicketUpdateIn, db: DbSession, _: SupportStaff
) -> StaffTicketDetail:
    return await service.update_staff(db, ticket_id, body)

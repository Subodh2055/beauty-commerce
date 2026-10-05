"""Support tickets.

Requesters (any signed-in user, customers and vendors alike) see only their own
tickets and never see staff internal notes. Status follows the conversation:
a staff reply → AWAITING_CUSTOMER, a requester reply → OPEN (reopening a
RESOLVED ticket). CLOSED is final.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationFailedError
from app.modules.support import repository as repo
from app.modules.support.models import SupportTicket, TicketMessage
from app.modules.support.schemas import (
    Assignee,
    MessageOut,
    StaffMessageIn,
    StaffTicketDetail,
    StaffTicketSummary,
    TicketCreateIn,
    TicketDetail,
    TicketSummary,
    TicketUpdateIn,
)
from app.modules.users.models import User
from app.shared.enums import TicketStatus
from app.shared.pagination import Page, PageParams


def _now() -> datetime:
    return datetime.now(UTC)


def _public_detail(t: SupportTicket) -> TicketDetail:
    return TicketDetail(
        **TicketSummary.model_validate(t).model_dump(),
        messages=[MessageOut.model_validate(m) for m in t.messages if not m.is_internal],
    )


async def _staff_detail(db: AsyncSession, t: SupportTicket) -> StaffTicketDetail:
    users = await repo.users_by_id(db, {u for u in (t.requester_id, t.assigned_to) if u})
    requester, assignee = users.get(t.requester_id), users.get(t.assigned_to)
    return StaffTicketDetail(
        **TicketSummary.model_validate(t).model_dump(),
        messages=[MessageOut.model_validate(m) for m in t.messages],
        requester_id=t.requester_id,
        requester_email=requester.email if requester else None,
        requester_name=requester.full_name if requester else None,
        assigned_to=t.assigned_to,
        assignee_email=assignee.email if assignee else None,
        order_number=await repo.order_number(db, t.order_id),
    )


def _page(rows, total, page: PageParams) -> Page[TicketSummary]:
    return Page(
        items=[TicketSummary.model_validate(t) for t in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


def _touch(ticket: SupportTicket) -> None:
    # Bump updated_at even when only a message was added, so lists sort by activity.
    ticket.updated_at = _now()


# --- Requester ---------------------------------------------------------------


async def open_ticket(db: AsyncSession, user: User, body: TicketCreateIn) -> TicketDetail:
    if body.order_id and not await repo.owns_order(db, user.id, body.order_id):
        raise ValidationFailedError("That order isn't on your account")
    ticket = SupportTicket(
        reference=await repo.next_reference(db),
        requester_id=user.id,
        order_id=body.order_id,
        subject=body.subject,
        category=body.category,
        status=TicketStatus.OPEN,
        messages=[TicketMessage(author_id=user.id, body=body.message, created_at=_now())],
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return _public_detail(ticket)


async def list_mine(db: AsyncSession, user_id: uuid.UUID, page: PageParams) -> Page[TicketSummary]:
    rows, total = await repo.list_for_requester(db, user_id, page.offset, page.size)
    return _page(rows, total, page)


async def _mine(db: AsyncSession, user_id: uuid.UUID, ticket_id: uuid.UUID) -> SupportTicket:
    ticket = await repo.get_for_requester(db, user_id, ticket_id)
    if ticket is None:
        raise NotFoundError("Ticket not found")
    return ticket


async def get_mine(db: AsyncSession, user_id: uuid.UUID, ticket_id: uuid.UUID) -> TicketDetail:
    return _public_detail(await _mine(db, user_id, ticket_id))


async def reply_mine(
    db: AsyncSession, user_id: uuid.UUID, ticket_id: uuid.UUID, body: str
) -> TicketDetail:
    ticket = await _mine(db, user_id, ticket_id)
    if ticket.status == TicketStatus.CLOSED:
        raise ValidationFailedError("This ticket is closed; please open a new one")
    ticket.messages.append(TicketMessage(author_id=user_id, body=body, created_at=_now()))
    ticket.status = TicketStatus.OPEN
    _touch(ticket)
    await db.commit()
    await db.refresh(ticket)
    return _public_detail(ticket)


async def close_mine(db: AsyncSession, user_id: uuid.UUID, ticket_id: uuid.UUID) -> TicketDetail:
    ticket = await _mine(db, user_id, ticket_id)
    ticket.status = TicketStatus.CLOSED
    ticket.closed_at = _now()
    await db.commit()
    await db.refresh(ticket)
    return _public_detail(ticket)


# --- Staff -------------------------------------------------------------------


async def list_all(
    db: AsyncSession,
    page: PageParams,
    *,
    status: str | None,
    assigned_to: uuid.UUID | None,
    priority: str | None = None,
    q: str | None = None,
) -> Page[StaffTicketSummary]:
    rows, total = await repo.list_all(
        db,
        status=status,
        assigned_to=assigned_to,
        priority=priority,
        q=q,
        offset=page.offset,
        limit=page.size,
    )
    users = await repo.users_by_id(
        db, {u for t in rows for u in (t.requester_id, t.assigned_to) if u}
    )
    items = []
    for t in rows:
        visible = [m for m in t.messages if not m.is_internal]
        last = visible[-1] if visible else None
        requester, assignee = users.get(t.requester_id), users.get(t.assigned_to)
        open_ = t.status not in (TicketStatus.RESOLVED, TicketStatus.CLOSED)
        items.append(
            StaffTicketSummary(
                **TicketSummary.model_validate(t).model_dump(),
                requester_id=t.requester_id,
                requester_email=requester.email if requester else None,
                requester_name=requester.full_name if requester else None,
                assigned_to=t.assigned_to,
                assignee_email=assignee.email if assignee else None,
                message_count=len(t.messages),
                last_message_at=t.messages[-1].created_at if t.messages else None,
                needs_reply=bool(last and not last.from_staff) and open_,
            )
        )
    return Page(items=items, total=total, page=page.page, size=page.size)


async def assignees(db: AsyncSession) -> list[Assignee]:
    return [
        Assignee(id=u.id, email=u.email, full_name=u.full_name) for u in await repo.assignees(db)
    ]


async def _get(db: AsyncSession, ticket_id: uuid.UUID) -> SupportTicket:
    ticket = await db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise NotFoundError("Ticket not found")
    return ticket


async def get_staff(db: AsyncSession, ticket_id: uuid.UUID) -> StaffTicketDetail:
    return await _staff_detail(db, await _get(db, ticket_id))


async def reply_staff(
    db: AsyncSession, staff_id: uuid.UUID, ticket_id: uuid.UUID, body: StaffMessageIn
) -> StaffTicketDetail:
    ticket = await _get(db, ticket_id)
    if ticket.status == TicketStatus.CLOSED:
        raise ValidationFailedError("This ticket is closed")
    ticket.messages.append(
        TicketMessage(
            author_id=staff_id,
            from_staff=True,
            is_internal=body.internal,
            body=body.body,
            created_at=_now(),
        )
    )
    if not body.internal:
        ticket.status = TicketStatus.AWAITING_CUSTOMER
    if ticket.assigned_to is None:
        ticket.assigned_to = staff_id
    _touch(ticket)
    await db.commit()
    await db.refresh(ticket)
    return await _staff_detail(db, ticket)


async def update_staff(
    db: AsyncSession, ticket_id: uuid.UUID, body: TicketUpdateIn
) -> StaffTicketDetail:
    ticket = await _get(db, ticket_id)
    changes = body.model_dump(exclude_unset=True)
    if "assigned_to" in changes and changes["assigned_to"] is not None:
        assignee = await db.get(User, changes["assigned_to"])
        if assignee is None or not assignee.has_permission("support.edit"):
            raise ValidationFailedError("Assign tickets to someone who can answer them")
    for field, value in changes.items():
        setattr(ticket, field, value)
    if changes.get("status") == TicketStatus.CLOSED:
        ticket.closed_at = _now()
    await db.commit()
    await db.refresh(ticket)
    return await _staff_detail(db, ticket)

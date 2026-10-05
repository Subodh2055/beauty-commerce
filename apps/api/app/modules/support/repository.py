import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.orders.models import Order
from app.modules.support.models import SupportTicket


async def next_reference(db: AsyncSession) -> str:
    # Sequential-ish like order numbers; the UNIQUE column backs it up.
    count = await db.scalar(select(func.count()).select_from(SupportTicket)) or 0
    return f"T-{count + 1:06d}"


async def owns_order(db: AsyncSession, user_id: uuid.UUID, order_id: uuid.UUID) -> bool:
    found = await db.scalar(select(Order.id).where(Order.id == order_id, Order.user_id == user_id))
    return found is not None


# Requester-scoped: another user's ticket is simply not found.


async def list_for_requester(
    db: AsyncSession, user_id: uuid.UUID, offset: int, limit: int
) -> tuple[list[SupportTicket], int]:
    stmt = select(SupportTicket).where(SupportTicket.requester_id == user_id)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(
        stmt.order_by(SupportTicket.updated_at.desc()).offset(offset).limit(limit)
    )
    return list(rows.all()), total


async def get_for_requester(
    db: AsyncSession, user_id: uuid.UUID, ticket_id: uuid.UUID
) -> SupportTicket | None:
    return await db.scalar(
        select(SupportTicket).where(
            SupportTicket.id == ticket_id, SupportTicket.requester_id == user_id
        )
    )


async def list_all(
    db: AsyncSession,
    *,
    status: str | None,
    assigned_to: uuid.UUID | None,
    offset: int,
    limit: int,
) -> tuple[list[SupportTicket], int]:
    stmt = select(SupportTicket)
    if status:
        stmt = stmt.where(SupportTicket.status == status)
    if assigned_to is not None:
        stmt = stmt.where(SupportTicket.assigned_to == assigned_to)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(
        stmt.order_by(SupportTicket.updated_at.desc()).offset(offset).limit(limit)
    )
    return list(rows.all()), total

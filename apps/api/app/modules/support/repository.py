import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.orders.models import Order
from app.modules.support.models import SupportTicket
from app.modules.users.models import Permission, Role, User, role_permissions, user_roles


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
    priority: str | None = None,
    q: str | None = None,
) -> tuple[list[SupportTicket], int]:
    stmt = select(SupportTicket)
    if status:
        stmt = stmt.where(SupportTicket.status == status)
    if priority:
        stmt = stmt.where(SupportTicket.priority == priority)
    if assigned_to is not None:
        stmt = stmt.where(SupportTicket.assigned_to == assigned_to)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.outerjoin(User, User.id == SupportTicket.requester_id).where(
            or_(
                SupportTicket.reference.ilike(pattern),
                SupportTicket.subject.ilike(pattern),
                User.email.ilike(pattern),
            )
        )
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(
        stmt.order_by(SupportTicket.updated_at.desc()).offset(offset).limit(limit)
    )
    return list(rows.unique().all()), total


async def users_by_id(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, User]:
    if not ids:
        return {}
    return {u.id: u for u in await db.scalars(select(User).where(User.id.in_(ids)))}


async def order_number(db: AsyncSession, order_id: uuid.UUID | None) -> str | None:
    if order_id is None:
        return None
    return await db.scalar(select(Order.order_number).where(Order.id == order_id))


async def assignees(db: AsyncSession) -> list[User]:
    """Active users who can answer tickets (support.edit, or super admins)."""
    can = (
        select(user_roles.c.user_id)
        .join(Role, Role.id == user_roles.c.role_id)
        .outerjoin(role_permissions, role_permissions.c.role_id == Role.id)
        .outerjoin(Permission, Permission.id == role_permissions.c.permission_id)
        .where(or_(Role.name == "SUPER_ADMIN", Permission.code == "support.edit"))
    )
    rows = await db.scalars(
        select(User).where(User.id.in_(can), User.is_active.is_(True)).order_by(User.email)
    )
    return list(rows.all())

import uuid
from decimal import Decimal

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.orders.models import Order
from app.modules.returns.models import ReturnRequest
from app.modules.support.models import SupportTicket
from app.modules.users.models import Role, User, user_roles
from app.shared.enums import OrderStatus, TicketStatus

# Roles that make an account a customer-facing one; any other role is staff.
NON_STAFF_ROLES = ("CUSTOMER", "VENDOR")
SPEND_STATUSES = (
    OrderStatus.PAID,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
)
Row = tuple[User, bool, int, Decimal]


def _has_role(condition):
    return exists(
        select(1)
        .select_from(user_roles.join(Role, Role.id == user_roles.c.role_id))
        .where(user_roles.c.user_id == User.id, condition)
    )


def _is_staff():
    # Custom roles count as staff too: anything that isn't CUSTOMER or VENDOR.
    return _has_role(Role.name.not_in(NON_STAFF_ROLES))


def _spend():
    return (
        select(
            Order.user_id.label("uid"),
            func.count(Order.id).label("n"),
            func.coalesce(func.sum(Order.total), 0).label("spent"),
        )
        .where(Order.status.in_(SPEND_STATUSES))
        .group_by(Order.user_id)
        .subquery()
    )


def _base():
    spend = _spend()
    stmt = (
        select(
            User,
            _has_role(Role.name == "VENDOR").label("is_vendor"),
            func.coalesce(spend.c.n, 0),
            func.coalesce(spend.c.spent, 0),
        )
        .outerjoin(spend, spend.c.uid == User.id)
        .where(~_is_staff())
    )
    return stmt, spend


def _rows(result) -> list[Row]:
    return [(u, bool(v), int(n), Decimal(s)) for u, v, n, s in result]


async def list_customers(
    db: AsyncSession,
    q: str | None,
    active: bool | None,
    sort: str,
    offset: int,
    limit: int,
) -> tuple[list[Row], int]:
    stmt, spend = _base()
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(User.email.ilike(pattern), User.full_name.ilike(pattern), User.phone.ilike(pattern))
        )
    if active is not None:
        stmt = stmt.where(User.is_active.is_(active))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    order = {
        "oldest": (User.created_at.asc(),),
        "spend": (func.coalesce(spend.c.spent, 0).desc(), User.created_at.desc()),
        "orders": (func.coalesce(spend.c.n, 0).desc(), User.created_at.desc()),
    }.get(sort, (User.created_at.desc(),))
    return _rows(await db.execute(stmt.order_by(*order).offset(offset).limit(limit))), total


async def get_customer(db: AsyncSession, user_id: uuid.UUID) -> Row | None:
    stmt, _ = _base()
    rows = _rows(await db.execute(stmt.where(User.id == user_id)))
    return rows[0] if rows else None


async def recent_orders(db: AsyncSession, user_id: uuid.UUID, limit: int = 10) -> list[Order]:
    rows = await db.scalars(
        select(Order).where(Order.user_id == user_id).order_by(Order.created_at.desc()).limit(limit)
    )
    return list(rows.all())


async def returns_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = select(func.count()).select_from(ReturnRequest).where(ReturnRequest.user_id == user_id)
    return await db.scalar(stmt) or 0


async def open_tickets(db: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(SupportTicket)
        .where(
            SupportTicket.requester_id == user_id,
            SupportTicket.status.in_((TicketStatus.OPEN, TicketStatus.AWAITING_CUSTOMER)),
        )
    )
    return await db.scalar(stmt) or 0

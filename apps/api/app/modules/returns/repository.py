import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.orders.models import Order
from app.modules.returns.models import Refund, ReturnRequest
from app.modules.users.models import User
from app.shared.enums import ReturnStatus

# Returns that still hold their items (a rejected one frees them to be asked again).
ACTIVE = (
    ReturnStatus.REQUESTED,
    ReturnStatus.APPROVED,
    ReturnStatus.RECEIVED,
    ReturnStatus.REFUNDED,
)


async def next_reference(db: AsyncSession) -> str:
    count = await db.scalar(select(func.count()).select_from(ReturnRequest)) or 0
    return f"RT-{datetime.now(UTC).year}-{count + 1:05d}"


async def get_order_for_user(
    db: AsyncSession, order_id: uuid.UUID, user_id: uuid.UUID
) -> Order | None:
    return await db.scalar(
        select(Order)
        .where(Order.id == order_id, Order.user_id == user_id)
        .options(selectinload(Order.items), selectinload(Order.history))
    )


async def returned_quantities(db: AsyncSession, order_id: uuid.UUID) -> dict[str, int]:
    """order_item_id → quantity already claimed by active returns."""
    taken: dict[str, int] = {}
    for items in await db.scalars(
        select(ReturnRequest.items).where(
            ReturnRequest.order_id == order_id, ReturnRequest.status.in_(ACTIVE)
        )
    ):
        for line in items:
            taken[line["order_item_id"]] = taken.get(line["order_item_id"], 0) + line["quantity"]
    return taken


async def refunded_total(db: AsyncSession, order_id: uuid.UUID) -> Decimal:
    return Decimal(
        await db.scalar(
            select(func.coalesce(func.sum(Refund.amount), 0)).where(Refund.order_id == order_id)
        )
        or 0
    )


async def list_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[ReturnRequest]:
    rows = await db.scalars(
        select(ReturnRequest)
        .where(ReturnRequest.user_id == user_id)
        .order_by(ReturnRequest.created_at.desc())
    )
    return list(rows.all())


async def list_admin(
    db: AsyncSession, status: str | None, q: str | None, offset: int, limit: int
) -> tuple[list[ReturnRequest], int]:
    stmt = select(ReturnRequest).join(Order, Order.id == ReturnRequest.order_id)
    if status:
        stmt = stmt.where(ReturnRequest.status == status)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.outerjoin(User, User.id == ReturnRequest.user_id).where(
            or_(
                ReturnRequest.reference.ilike(pattern),
                Order.order_number.ilike(pattern),
                User.email.ilike(pattern),
            )
        )
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(
        stmt.order_by(ReturnRequest.created_at.desc()).offset(offset).limit(limit)
    )
    return list(rows.unique().all()), total


async def get(db: AsyncSession, return_id: uuid.UUID, *, for_update: bool = False):
    stmt = select(ReturnRequest).where(ReturnRequest.id == return_id)
    if for_update:
        stmt = stmt.with_for_update()
    return await db.scalar(stmt)


async def get_order_locked(db: AsyncSession, order_id: uuid.UUID) -> Order | None:
    """The order row locked, so concurrent refunds can't both pass the
    refundable-amount check."""
    return await db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .with_for_update(of=Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.vendor_orders),
            selectinload(Order.history),
            selectinload(Order.payments),
        )
    )


async def orders_by_id(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, Order]:
    if not ids:
        return {}
    rows = await db.scalars(
        select(Order).where(Order.id.in_(ids)).options(selectinload(Order.items))
    )
    return {o.id: o for o in rows}


async def users_by_id(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, User]:
    if not ids:
        return {}
    return {u.id: u for u in await db.scalars(select(User).where(User.id.in_(ids)))}


async def refunded_by_order(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    if not ids:
        return {}
    rows = await db.execute(
        select(Refund.order_id, func.sum(Refund.amount))
        .where(Refund.order_id.in_(ids))
        .group_by(Refund.order_id)
    )
    return {oid: Decimal(v) for oid, v in rows}

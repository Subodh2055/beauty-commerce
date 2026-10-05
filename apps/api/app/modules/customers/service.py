"""Customer accounts for staff: browse, look one up, block or unblock.

Staff accounts are not customers here (they're managed in /super-admin), so a
staff id is simply not found. Blocking signs the person out everywhere."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationFailedError
from app.modules.audit import service as audit
from app.modules.auth import repository as auth_repo
from app.modules.customers import repository as repo
from app.modules.customers.schemas import (
    CustomerDetail,
    CustomerOrder,
    CustomerRow,
    CustomerStatusIn,
)
from app.modules.users import service as users_service
from app.shared.pagination import Page, PageParams


def _row(user, is_vendor: bool, orders: int, spent) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "is_active": user.is_active,
        "is_email_verified": user.is_email_verified,
        "is_vendor": is_vendor,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
        "orders_count": orders,
        "total_spent": spent,
    }


async def list_customers(
    db: AsyncSession, page: PageParams, q: str | None, active: bool | None, sort: str
) -> Page[CustomerRow]:
    rows, total = await repo.list_customers(db, q, active, sort, page.offset, page.size)
    return Page(
        items=[CustomerRow(**_row(*r)) for r in rows], total=total, page=page.page, size=page.size
    )


async def get_customer(db: AsyncSession, user_id: uuid.UUID) -> CustomerDetail:
    found = await repo.get_customer(db, user_id)
    if found is None:
        raise NotFoundError("Customer not found")
    user = found[0]
    return CustomerDetail(
        **_row(*found),
        addresses=await users_service.list_addresses(db, user.id),
        recent_orders=[
            CustomerOrder.model_validate(o, from_attributes=True)
            for o in await repo.recent_orders(db, user.id)
        ],
        returns_count=await repo.returns_count(db, user.id),
        open_tickets=await repo.open_tickets(db, user.id),
    )


async def set_status(
    db: AsyncSession, user_id: uuid.UUID, body: CustomerStatusIn, staff_id: uuid.UUID
) -> CustomerDetail:
    if user_id == staff_id:
        raise ValidationFailedError("You can't block your own account")
    found = await repo.get_customer(db, user_id)
    if found is None:
        raise NotFoundError("Customer not found")
    user = found[0]
    if user.is_active == body.active:
        raise ValidationFailedError(
            "This account is already active" if body.active else "This account is already blocked"
        )
    user.is_active = body.active
    reason = (body.reason or "").strip() or None
    if body.active:
        audit.record(db, "users.unblock", "users", user.id, {"reason": reason})
    else:
        # Bulk UPDATE of refresh tokens: invisible to the audit listener.
        await auth_repo.revoke_all_for_user(db, user.id)
        audit.record(db, "users.block", "users", user.id, {"reason": reason})
    await db.commit()
    return await get_customer(db, user_id)

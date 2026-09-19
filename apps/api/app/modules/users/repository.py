import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import Address


async def list_addresses(db: AsyncSession, user_id: uuid.UUID) -> list[Address]:
    stmt = (
        select(Address)
        .where(Address.user_id == user_id)
        .order_by(Address.is_default.desc(), Address.created_at.desc())
    )
    return list((await db.scalars(stmt)).all())


async def get_address(
    db: AsyncSession, user_id: uuid.UUID, address_id: uuid.UUID
) -> Address | None:
    return await db.scalar(
        select(Address).where(Address.id == address_id, Address.user_id == user_id)
    )


async def count_addresses(db: AsyncSession, user_id: uuid.UUID) -> int:
    from sqlalchemy import func

    return (
        await db.scalar(select(func.count()).select_from(Address).where(Address.user_id == user_id))
        or 0
    )


async def clear_default(
    db: AsyncSession, user_id: uuid.UUID, keep_id: uuid.UUID | None = None
) -> None:
    stmt = update(Address).where(Address.user_id == user_id, Address.is_default.is_(True))
    if keep_id is not None:
        stmt = stmt.where(Address.id != keep_id)
    await db.execute(stmt.values(is_default=False))

"""Address book. Invariant: at most one default address per user, and if the
user has any address, exactly one is the default."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.users import repository as repo
from app.modules.users.models import Address
from app.modules.users.schemas import AddressIn, AddressOut


async def list_addresses(db: AsyncSession, user_id: uuid.UUID) -> list[AddressOut]:
    return [AddressOut.model_validate(a) for a in await repo.list_addresses(db, user_id)]


async def create_address(db: AsyncSession, user_id: uuid.UUID, body: AddressIn) -> AddressOut:
    first = await repo.count_addresses(db, user_id) == 0
    make_default = body.is_default or first

    address = Address(
        user_id=user_id,
        label=body.label,
        recipient_name=body.recipient_name,
        phone=body.phone,
        line1=body.line1,
        line2=body.line2,
        city=body.city,
        state=body.state,
        postal_code=body.postal_code,
        country=body.country.upper(),
        is_default=make_default,
    )
    db.add(address)
    await db.flush()
    if make_default:
        await repo.clear_default(db, user_id, keep_id=address.id)
    await db.commit()
    await db.refresh(address)
    return AddressOut.model_validate(address)


async def update_address(
    db: AsyncSession, user_id: uuid.UUID, address_id: uuid.UUID, body: AddressIn
) -> AddressOut:
    address = await repo.get_address(db, user_id, address_id)
    if address is None:
        raise NotFoundError("Address not found")

    address.label = body.label
    address.recipient_name = body.recipient_name
    address.phone = body.phone
    address.line1 = body.line1
    address.line2 = body.line2
    address.city = body.city
    address.state = body.state
    address.postal_code = body.postal_code
    address.country = body.country.upper()

    if body.is_default and not address.is_default:
        address.is_default = True
        await repo.clear_default(db, user_id, keep_id=address.id)
    await db.commit()
    await db.refresh(address)
    return AddressOut.model_validate(address)


async def delete_address(db: AsyncSession, user_id: uuid.UUID, address_id: uuid.UUID) -> None:
    address = await repo.get_address(db, user_id, address_id)
    if address is None:
        raise NotFoundError("Address not found")
    was_default = address.is_default
    await db.delete(address)
    await db.flush()

    # Promote another address to default if we removed the default one.
    if was_default:
        remaining = await repo.list_addresses(db, user_id)
        if remaining:
            remaining[0].is_default = True
    await db.commit()


async def set_default(db: AsyncSession, user_id: uuid.UUID, address_id: uuid.UUID) -> AddressOut:
    address = await repo.get_address(db, user_id, address_id)
    if address is None:
        raise NotFoundError("Address not found")
    address.is_default = True
    await repo.clear_default(db, user_id, keep_id=address.id)
    await db.commit()
    await db.refresh(address)
    return AddressOut.model_validate(address)

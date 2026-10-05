import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import Permission, Role, User, user_roles

NON_STAFF_ROLES = ("CUSTOMER", "VENDOR")


async def roles_with_counts(db: AsyncSession) -> list[tuple[Role, int]]:
    counts = (
        select(user_roles.c.role_id, func.count().label("n"))
        .group_by(user_roles.c.role_id)
        .subquery()
    )
    rows = await db.execute(
        select(Role, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.role_id == Role.id)
        .order_by(Role.name)
    )
    return [(r, n) for r, n in rows]


async def get_role(db: AsyncSession, role_id: uuid.UUID) -> Role | None:
    return await db.get(Role, role_id)


async def get_role_by_name(db: AsyncSession, name: str) -> Role | None:
    return await db.scalar(select(Role).where(Role.name == name))


async def roles_by_names(db: AsyncSession, names: list[str]) -> list[Role]:
    return list((await db.scalars(select(Role).where(Role.name.in_(names)))).all())


async def role_user_count(db: AsyncSession, role_id: uuid.UUID) -> int:
    stmt = select(func.count()).select_from(user_roles).where(user_roles.c.role_id == role_id)
    return await db.scalar(stmt) or 0


async def permissions_by_codes(db: AsyncSession, codes: list[str]) -> list[Permission]:
    if not codes:
        return []
    return list((await db.scalars(select(Permission).where(Permission.code.in_(codes)))).all())


async def permission_descriptions(db: AsyncSession) -> dict[str, str]:
    rows = await db.execute(select(Permission.code, Permission.description))
    return {c: d or "" for c, d in rows}


async def staff_users(db: AsyncSession, q: str | None) -> list[User]:
    staff = (
        select(user_roles.c.user_id)
        .join(Role, Role.id == user_roles.c.role_id)
        .where(Role.name.not_in(NON_STAFF_ROLES))
    )
    stmt = select(User).where(User.id.in_(staff))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.email.ilike(pattern), User.full_name.ilike(pattern)))
    return list((await db.scalars(stmt.order_by(User.email))).all())


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(func.lower(User.email) == email.lower()))


async def active_super_admins(db: AsyncSession) -> int:
    stmt = (
        select(func.count(func.distinct(User.id)))
        .select_from(User)
        .join(user_roles, user_roles.c.user_id == User.id)
        .join(Role, Role.id == user_roles.c.role_id)
        .where(Role.name == "SUPER_ADMIN", User.is_active.is_(True))
    )
    return await db.scalar(stmt) or 0

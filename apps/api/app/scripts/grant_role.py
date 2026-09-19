"""Grant a role to a user by email.

    python -m app.scripts.grant_role user@example.com ADMIN
    python -m app.scripts.grant_role user@example.com SUPER_ADMIN

Roles: CUSTOMER, STAFF, VENDOR, ADMIN, SUPER_ADMIN
"""

import asyncio
import sys

from sqlalchemy import select

from app.core.database import SessionLocal
from app.modules.users.models import Role, User
from app.shared.enums import Role as RoleEnum


async def grant(email: str, role_name: str) -> None:
    role_name = role_name.upper()
    valid = {r.value for r in RoleEnum}
    if role_name not in valid:
        print(f"Invalid role '{role_name}'. Choose from: {', '.join(sorted(valid))}")
        return

    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            print(f"No user with email {email!r}. Register first.")
            return
        role = await db.scalar(select(Role).where(Role.name == role_name))
        if role is None:
            print(f"Role {role_name} not found; run migrations first.")
            return
        if any(r.name == role_name for r in user.roles):
            print(f"{email} already has role {role_name}.")
            return
        user.roles.append(role)
        await db.commit()
        print(f"Granted {role_name} to {email}. Current roles: {[r.name for r in user.roles]}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python -m app.scripts.grant_role <email> <ROLE>")
        raise SystemExit(1)
    asyncio.run(grant(sys.argv[1], sys.argv[2]))

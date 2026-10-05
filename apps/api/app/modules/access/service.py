"""Super-admin access control: who is staff, which roles exist, what each grants.

Guard rails, all enforced here (the UI only mirrors them):
- super-admin-only codes can't be granted to any role, and SUPER_ADMIN itself,
  CUSTOMER and VENDOR are locked;
- nobody can change their own roles or deactivate themselves;
- the last active SUPER_ADMIN can't be demoted or deactivated;
- user_roles / role_permissions are association rows the audit listener can't
  see, so every change records an explicit audit entry with before/after.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationFailedError
from app.modules.access import repository as repo
from app.modules.access.schemas import (
    AdminGrantIn,
    AdminStatusIn,
    AdminUserOut,
    MatrixModuleOut,
    PermissionMatrix,
    RoleCreateIn,
    RoleOut,
    RoleUpdateIn,
)
from app.modules.audit import service as audit
from app.modules.auth import repository as auth_repo
from app.modules.users.models import Role, User
from app.shared.permissions import (
    ACTIONS,
    BUILT_IN_ROLES,
    GRANTABLE,
    LOCKED_ROLES,
    MATRIX,
    SUPER_ADMIN_ONLY,
)

NON_STAFF = {"CUSTOMER", "VENDOR"}


# --- matrix + roles -----------------------------------------------------------


async def matrix(db: AsyncSession) -> PermissionMatrix:
    return PermissionMatrix(
        actions=list(ACTIONS),
        modules=[
            MatrixModuleOut(
                key=m.key,
                label=m.label,
                group=m.group,
                actions={a: c.value for a, c in m.actions.items()},
                super_admin_only=m.super_admin_only,
            )
            for m in MATRIX
        ],
        descriptions=await repo.permission_descriptions(db),
    )


def _role_out(role: Role, users: int) -> RoleOut:
    codes = sorted(p.code for p in role.permissions)
    if role.name == "SUPER_ADMIN":
        codes = sorted(GRANTABLE | SUPER_ADMIN_ONLY)
    return RoleOut(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=codes,
        user_count=users,
        built_in=role.name in BUILT_IN_ROLES,
        locked=role.name in LOCKED_ROLES,
    )


async def list_roles(db: AsyncSession) -> list[RoleOut]:
    return [_role_out(r, n) for r, n in await repo.roles_with_counts(db)]


async def _grants(db: AsyncSession, codes: list[str]):
    wanted = set(codes)
    forbidden = wanted & SUPER_ADMIN_ONLY
    if forbidden:
        raise ValidationFailedError(
            f"Only the super admin role can hold: {', '.join(sorted(forbidden))}"
        )
    unknown = wanted - GRANTABLE
    if unknown:
        raise ValidationFailedError(f"Unknown permission: {', '.join(sorted(unknown))}")
    return await repo.permissions_by_codes(db, sorted(wanted))


async def create_role(db: AsyncSession, body: RoleCreateIn) -> RoleOut:
    if body.name in BUILT_IN_ROLES or await repo.get_role_by_name(db, body.name):
        raise ConflictError("A role with that name already exists")
    role = Role(name=body.name, description=(body.description or "").strip() or None)
    role.permissions = await _grants(db, body.permissions)
    db.add(role)
    await db.flush()
    audit.record(
        db, "roles.permissions", "roles", role.id, {"permissions": [[], sorted(body.permissions)]}
    )
    await db.commit()
    return _role_out(role, 0)


async def update_role(db: AsyncSession, role_id: uuid.UUID, body: RoleUpdateIn) -> RoleOut:
    role = await repo.get_role(db, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    if role.name in LOCKED_ROLES:
        raise ValidationFailedError(f"The {role.name} role can't be edited")
    before = sorted(p.code for p in role.permissions)
    role.permissions = await _grants(db, body.permissions)
    role.description = (body.description or "").strip() or role.description
    after = sorted(p.code for p in role.permissions)
    if before != after:
        audit.record(
            db,
            "roles.permissions",
            "roles",
            role.id,
            {
                "permissions": [before, after],
                "granted": sorted(set(after) - set(before)),
                "revoked": sorted(set(before) - set(after)),
            },
        )
    await db.commit()
    return _role_out(role, await repo.role_user_count(db, role.id))


async def delete_role(db: AsyncSession, role_id: uuid.UUID) -> None:
    role = await repo.get_role(db, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    if role.name in BUILT_IN_ROLES:
        raise ValidationFailedError("Built-in roles can't be deleted")
    if await repo.role_user_count(db, role.id):
        raise ConflictError("Remove this role from everyone who has it first")
    await db.delete(role)
    await db.commit()


# --- admin users --------------------------------------------------------------


def _admin_out(user: User, me: uuid.UUID) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        roles=sorted(r.name for r in user.roles if r.name not in NON_STAFF),
        is_active=user.is_active,
        is_self=user.id == me,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


async def list_admins(db: AsyncSession, me: uuid.UUID, q: str | None) -> list[AdminUserOut]:
    return [_admin_out(u, me) for u in await repo.staff_users(db, q)]


async def _staff_roles(db: AsyncSession, names: list[str]) -> list[Role]:
    wanted = sorted(set(names))
    bad = [n for n in wanted if n in NON_STAFF]
    if bad:
        raise ValidationFailedError(f"{', '.join(bad)} isn't a staff role")
    roles = await repo.roles_by_names(db, wanted)
    missing = set(wanted) - {r.name for r in roles}
    if missing:
        raise ValidationFailedError(f"Unknown role: {', '.join(sorted(missing))}")
    return roles


async def _set_staff_roles(db: AsyncSession, user: User, roles: list[Role], me: uuid.UUID) -> None:
    if user.id == me:
        raise ValidationFailedError("You can't change your own roles")
    before = sorted(r.name for r in user.roles if r.name not in NON_STAFF)
    after = sorted(r.name for r in roles)
    if "SUPER_ADMIN" in before and "SUPER_ADMIN" not in after:
        if user.is_active and await repo.active_super_admins(db) <= 1:
            raise ValidationFailedError("There must always be at least one active super admin")
    keep = [r for r in user.roles if r.name in NON_STAFF]
    if not any(r.name == "CUSTOMER" for r in keep):
        customer = await repo.get_role_by_name(db, "CUSTOMER")
        keep += [customer] if customer else []
    user.roles = keep + roles
    if before != after:
        audit.record(db, "users.roles", "users", user.id, {"roles": [before, after]})
        # New grants apply on the next request; revoking access should not
        # wait for a refresh token to expire.
        if set(before) - set(after):
            await auth_repo.revoke_all_for_user(db, user.id)


async def grant_admin(db: AsyncSession, body: AdminGrantIn, me: uuid.UUID) -> AdminUserOut:
    user = await repo.get_user_by_email(db, body.email)
    if user is None:
        raise NotFoundError("No account uses that email. Ask them to sign up first.")
    roles = await _staff_roles(db, body.roles)
    current = [r for r in user.roles if r.name not in NON_STAFF]
    await _set_staff_roles(db, user, sorted({*current, *roles}, key=lambda r: r.name), me)
    await db.commit()
    return _admin_out(user, me)


async def set_admin_roles(
    db: AsyncSession, user_id: uuid.UUID, names: list[str], me: uuid.UUID
) -> AdminUserOut:
    user = await repo.get_user(db, user_id)
    if user is None:
        raise NotFoundError("User not found")
    await _set_staff_roles(db, user, await _staff_roles(db, names), me)
    await db.commit()
    return _admin_out(user, me)


async def set_admin_status(
    db: AsyncSession, user_id: uuid.UUID, body: AdminStatusIn, me: uuid.UUID
) -> AdminUserOut:
    user = await repo.get_user(db, user_id)
    if user is None or not any(r.name not in NON_STAFF for r in user.roles):
        raise NotFoundError("Admin not found")
    if user.id == me:
        raise ValidationFailedError("You can't deactivate your own account")
    if user.is_active == body.active:
        raise ValidationFailedError("Nothing to change")
    if not body.active and user.is_super_admin and await repo.active_super_admins(db) <= 1:
        raise ValidationFailedError("There must always be at least one active super admin")
    user.is_active = body.active
    if not body.active:
        await auth_repo.revoke_all_for_user(db, user.id)
    audit.record(
        db,
        "users.activate" if body.active else "users.deactivate",
        "users",
        user.id,
        {"reason": (body.reason or "").strip() or None},
    )
    await db.commit()
    return _admin_out(user, me)

"""/super-admin — admin users, roles and the permission matrix.

Every route needs a super-admin-only permission, which `User.has_permission`
only ever grants to SUPER_ADMIN."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.access import service
from app.modules.access.schemas import (
    AdminGrantIn,
    AdminRolesIn,
    AdminStatusIn,
    AdminUserOut,
    PermissionMatrix,
    RoleCreateIn,
    RoleOut,
    RoleUpdateIn,
)
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import require_permission
from app.modules.users.models import User
from app.shared.enums import Permission

router = APIRouter(dependencies=[Audited])

DbSession = Annotated[AsyncSession, Depends(get_db)]


def _can(code: Permission):
    return Annotated[User, Depends(require_permission(code))]


AdminsView = _can(Permission.ADMINS_VIEW)
AdminsEdit = _can(Permission.ADMINS_EDIT)
RolesView = _can(Permission.ROLES_VIEW)
RolesCreate = _can(Permission.ROLES_CREATE)
RolesEdit = _can(Permission.ROLES_EDIT)
RolesDelete = _can(Permission.ROLES_DELETE)


@router.get("/permissions", response_model=PermissionMatrix, summary="Module x action matrix")
async def permission_matrix(db: DbSession, _: RolesView) -> PermissionMatrix:
    return await service.matrix(db)


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(db: DbSession, _: RolesView) -> list[RoleOut]:
    return await service.list_roles(db)


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(body: RoleCreateIn, db: DbSession, _: RolesCreate) -> RoleOut:
    return await service.create_role(db, body)


@router.put("/roles/{role_id}", response_model=RoleOut, summary="Replace a role's permissions")
async def update_role(
    role_id: uuid.UUID, body: RoleUpdateIn, db: DbSession, _: RolesEdit
) -> RoleOut:
    return await service.update_role(db, role_id, body)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role_id: uuid.UUID, db: DbSession, _: RolesDelete) -> None:
    await service.delete_role(db, role_id)


@router.get("/admins", response_model=list[AdminUserOut])
async def list_admins(
    db: DbSession, me: AdminsView, q: str | None = Query(default=None, max_length=100)
) -> list[AdminUserOut]:
    return await service.list_admins(db, me.id, q)


@router.post(
    "/admins",
    response_model=AdminUserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Give an existing account staff roles",
)
async def grant_admin(body: AdminGrantIn, db: DbSession, me: AdminsEdit) -> AdminUserOut:
    return await service.grant_admin(db, body, me.id)


@router.put("/admins/{user_id}/roles", response_model=AdminUserOut)
async def set_admin_roles(
    user_id: uuid.UUID, body: AdminRolesIn, db: DbSession, me: AdminsEdit
) -> AdminUserOut:
    return await service.set_admin_roles(db, user_id, body.roles, me.id)


@router.patch("/admins/{user_id}/status", response_model=AdminUserOut)
async def set_admin_status(
    user_id: uuid.UUID, body: AdminStatusIn, db: DbSession, me: AdminsEdit
) -> AdminUserOut:
    return await service.set_admin_status(db, user_id, body, me.id)

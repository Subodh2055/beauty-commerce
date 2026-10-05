import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class MatrixModuleOut(BaseModel):
    key: str
    label: str
    group: str
    actions: dict[str, str]  # action → permission code
    super_admin_only: bool


class PermissionMatrix(BaseModel):
    actions: list[str]  # column order: view, create, edit, delete
    modules: list[MatrixModuleOut]
    descriptions: dict[str, str]  # code → human description


class RoleOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    permissions: list[str]
    user_count: int
    built_in: bool
    # Locked roles can't be edited here: SUPER_ADMIN holds everything implicitly,
    # CUSTOMER and VENDOR aren't staff roles.
    locked: bool


class RoleCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=50, pattern=r"^[A-Z][A-Z0-9_]*$")
    description: str | None = Field(default=None, max_length=255)
    permissions: list[str] = Field(default_factory=list, max_length=200)


class RoleUpdateIn(BaseModel):
    description: str | None = Field(default=None, max_length=255)
    permissions: list[str] = Field(max_length=200)


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None = None
    roles: list[str]  # staff roles only
    is_active: bool
    is_self: bool
    last_login_at: datetime | None = None
    created_at: datetime


class AdminGrantIn(BaseModel):
    email: EmailStr
    roles: list[str] = Field(min_length=1, max_length=10)


class AdminRolesIn(BaseModel):
    """The complete set of staff roles; [] removes admin access entirely."""

    roles: list[str] = Field(max_length=10)


class AdminStatusIn(BaseModel):
    active: bool
    reason: str | None = Field(default=None, max_length=500)

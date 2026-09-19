"""Auth dependencies: extract the bearer token, load the current user, RBAC."""

import uuid
from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.modules.auth import repository as repo
from app.modules.users.models import User

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]
BearerCreds = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def request_meta(request: Request) -> tuple[str | None, str | None]:
    ua = request.headers.get("user-agent")
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else None
    )
    return ua, ip


RequestMeta = Annotated[tuple[str | None, str | None], Depends(request_meta)]


async def get_current_user(db: DbSession, creds: BearerCreds) -> User:
    if creds is None:
        raise UnauthorizedError("Not authenticated")
    payload = decode_token(creds.credentials, "access")
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise UnauthorizedError("Invalid token") from exc

    user = await repo.get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("Account is unavailable")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(db: DbSession, creds: BearerCreds) -> User | None:
    """Like get_current_user but returns None instead of raising when there is
    no (or an invalid) token. For endpoints that are public but personalise
    when signed in."""
    if creds is None:
        return None
    try:
        return await get_current_user(db, creds)
    except UnauthorizedError:
        return None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def require_roles(*roles: str) -> Callable[[User], Coroutine[Any, Any, User]]:
    """Dependency factory enforcing that the current user has one of `roles`."""

    async def checker(user: CurrentUser) -> User:
        if not user.has_role(*roles):
            raise ForbiddenError("You do not have access to this resource")
        return user

    return checker


# Anyone who can access the admin area (staff and above).
AdminUser = Annotated[User, Depends(require_roles("STAFF", "ADMIN", "SUPER_ADMIN"))]

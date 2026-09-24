"""Password hashing and JWT helpers.

Access tokens are short-lived and signed with JWT_SECRET.
Refresh tokens are long-lived, signed with JWT_REFRESH_SECRET, and carry a
`jti` so they can be rotated/revoked by the auth module.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from pwdlib import PasswordHash

from app.core.config import settings
from app.core.exceptions import TokenExpiredError, UnauthorizedError

_password_hash = PasswordHash.recommended()

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return _password_hash.verify(password, hashed)


def _secret_for(token_type: TokenType) -> str:
    return settings.jwt_secret if token_type == "access" else settings.jwt_refresh_secret


def create_token(
    subject: str,
    token_type: TokenType,
    extra: dict[str, Any] | None = None,
    *,
    jti: str | None = None,
) -> str:
    now = datetime.now(UTC)
    if token_type == "access":
        expires = now + timedelta(minutes=settings.access_token_expire_minutes)
    else:
        # The refresh token's own lifetime IS the idle window: rotation on every
        # refresh slides it forward, so a session with no traffic simply lapses.
        expires = now + timedelta(minutes=settings.session_idle_timeout_minutes)

    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": expires,
        "jti": jti or uuid.uuid4().hex,
        **(extra or {}),
    }
    return jwt.encode(payload, _secret_for(token_type), algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, _secret_for(expected_type), algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid token") from exc

    if payload.get("type") != expected_type:
        raise UnauthorizedError("Invalid token type")
    return payload


# --- Single-use purpose tokens (email verification, password reset) ---------
# Signed with JWT_SECRET and carry a `purpose` claim. Short-lived.


def create_purpose_token(subject: str, purpose: str, expire_minutes: int = 30) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "type": "purpose",
        "purpose": purpose,
        "iat": now,
        "exp": now + timedelta(minutes=expire_minutes),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_purpose_token(token: str, purpose: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("This link has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid link") from exc

    if payload.get("type") != "purpose" or payload.get("purpose") != purpose:
        raise UnauthorizedError("Invalid link")
    return payload

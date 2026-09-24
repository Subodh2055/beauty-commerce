"""Auth business logic: registration, login, token rotation, password reset.

Security notes:
- Passwords hashed with argon2 (pwdlib).
- Access tokens are short-lived JWTs; refresh tokens carry the idle window and
  are tracked by `jti` in `refresh_tokens` so they can be rotated and revoked.
- Refresh rotation detects reuse of an already-revoked token and revokes the
  whole family (treat as theft).
- Sessions have two deadlines, both applied to every role:
  idle (SESSION_IDLE_TIMEOUT_MINUTES, default 40) is the refresh token's own
  lifetime and slides forward on each rotation; absolute
  (SESSION_ABSOLUTE_TIMEOUT_HOURS, default 8) is anchored to sign-in via the
  `sst` claim and cannot be extended. Either one raises SessionExpiredError.
- Email verification and password-reset delivery are logged, not emailed, until
  SMTP is configured (Phase 8). The tokens themselves are real and enforced.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    ConflictError,
    SessionExpiredError,
    TokenExpiredError,
    UnauthorizedError,
    ValidationFailedError,
)
from app.core.logging import get_logger
from app.core.security import (
    create_purpose_token,
    create_token,
    decode_purpose_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.integrations import notifications as transport
from app.modules.auth import repository as repo
from app.modules.auth.schemas import AuthResult, TokenPair, UserOut
from app.modules.users.models import User
from app.shared.enums import Role as RoleName

log = get_logger(__name__)


async def _send_verification_email(user: User) -> None:
    """Build a verification link and dispatch it (n8n → SMTP → log fallback)."""
    token = create_purpose_token(str(user.id), "verify_email", expire_minutes=60 * 24)
    link = f"{settings.frontend_url.rstrip('/')}/verify-email?token={token}"
    subject = "Verify your email — Beauty Commerce"
    text = (
        f"Welcome to Beauty Commerce!\n\nConfirm your email address:\n{link}\n\n"
        "This link expires in 24 hours."
    )
    html = (
        "<div style='font-family:sans-serif;max-width:520px'>"
        "<h2>Confirm your email</h2>"
        "<p>Welcome to Beauty Commerce! Please confirm your email address.</p>"
        f"<p><a href='{link}' style='display:inline-block;background:#b03a5b;color:#fff;"
        "padding:10px 18px;border-radius:999px;text-decoration:none'>Verify email</a></p>"
        f"<p style='color:#777;font-size:12px'>Or paste this link: {link}<br>"
        "Expires in 24 hours.</p>"
        "</div>"
    )
    payload = {"link": link, "user_id": str(user.id)}
    await transport.dispatch("auth.verify_email", payload, user.email, subject, html, text)


RequestMeta = tuple[str | None, str | None]  # (user_agent, ip)


def _to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_email_verified=user.is_email_verified,
        roles=[r.name for r in user.roles],
    )


async def _issue_tokens(
    db: AsyncSession,
    user: User,
    meta: RequestMeta,
    *,
    session_id: str | None = None,
    session_started_at: datetime | None = None,
) -> TokenPair:
    """Mint an access/refresh pair.

    Omit `session_id`/`session_started_at` to begin a new session (sign-in);
    pass the stored values to continue an existing one (refresh rotation), which
    is what keeps the absolute cap anchored to the original sign-in.
    """
    now = datetime.now(UTC)
    session_id = session_id or uuid.uuid4().hex
    session_started_at = session_started_at or now

    roles = [r.name for r in user.roles]
    # `sst` lets any request check the absolute cap straight from the token,
    # with no extra query.
    session_claims = {"sid": session_id, "sst": int(session_started_at.timestamp())}
    access = create_token(str(user.id), "access", {"roles": roles, **session_claims})
    refresh = create_token(str(user.id), "refresh", session_claims)

    payload = decode_token(refresh, "refresh")
    await repo.store_refresh_token(
        db,
        jti=payload["jti"],
        user_id=user.id,
        session_id=session_id,
        session_started_at=session_started_at,
        expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        user_agent=meta[0],
        ip_address=meta[1],
    )
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


async def register(
    db: AsyncSession, email: str, password: str, full_name: str | None, meta: RequestMeta
) -> AuthResult:
    email = email.lower()
    if await repo.get_user_by_email(db, email):
        raise ConflictError("An account with this email already exists")

    user = User(email=email, hashed_password=hash_password(password), full_name=full_name)
    customer = await repo.get_role(db, RoleName.CUSTOMER)
    if customer:
        user.roles.append(customer)
    repo.add_user(db, user)
    await db.flush()

    await _send_verification_email(user)

    tokens = await _issue_tokens(db, user, meta)
    await db.commit()
    await db.refresh(user, ["roles"])
    return AuthResult(user=_to_user_out(user), tokens=tokens)


async def login(db: AsyncSession, email: str, password: str, meta: RequestMeta) -> AuthResult:
    user = await repo.get_user_by_email(db, email.lower())
    # Constant-ish work whether or not the user exists, and one generic error.
    if (
        user is None
        or not user.hashed_password
        or not verify_password(password, user.hashed_password)
    ):
        raise UnauthorizedError("Incorrect email or password")
    if not user.is_active:
        raise UnauthorizedError("This account is disabled")

    user.last_login_at = datetime.now(UTC)
    tokens = await _issue_tokens(db, user, meta)
    await db.commit()
    return AuthResult(user=_to_user_out(user), tokens=tokens)


async def refresh(db: AsyncSession, refresh_token: str, meta: RequestMeta) -> TokenPair:
    try:
        payload = decode_token(refresh_token, "refresh")
    except TokenExpiredError as exc:
        # The refresh token's lifetime is the idle window, so an expired one
        # means the session simply went quiet for too long.
        raise SessionExpiredError(
            f"You were signed out after {settings.session_idle_timeout_minutes} "
            "minutes of inactivity."
        ) from exc
    jti = payload["jti"]
    stored = await repo.get_refresh_token(db, jti)

    if stored is None:
        raise UnauthorizedError("Invalid refresh token")
    if not stored.is_active:
        # Reuse of a revoked token → likely theft. Revoke the whole family.
        await repo.revoke_all_for_user(db, stored.user_id)
        await db.commit()
        log.warning("refresh_token_reuse", user_id=str(stored.user_id), jti=jti)
        raise UnauthorizedError("Refresh token has been revoked")
    now = datetime.now(UTC)
    if stored.expires_at <= now:
        # Belt and braces: the JWT `exp` normally fires first.
        await repo.revoke_session(db, stored.session_id)
        await db.commit()
        raise SessionExpiredError(
            f"You were signed out after {settings.session_idle_timeout_minutes} "
            "minutes of inactivity."
        )
    if now - stored.session_started_at >= timedelta(hours=settings.session_absolute_timeout_hours):
        # Hard ceiling: no amount of activity extends a session past this.
        await repo.revoke_session(db, stored.session_id)
        await db.commit()
        log.info("session_absolute_timeout", user_id=str(stored.user_id), sid=stored.session_id)
        raise SessionExpiredError(
            f"Your session reached its {settings.session_absolute_timeout_hours}-hour limit. "
            "Please sign in again."
        )

    user = await repo.get_user_by_id(db, stored.user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("Account is unavailable")

    await repo.revoke_refresh_token(db, jti)  # rotate
    tokens = await _issue_tokens(
        db,
        user,
        meta,
        session_id=stored.session_id,
        session_started_at=stored.session_started_at,
    )
    await db.commit()
    return tokens


async def logout(db: AsyncSession, refresh_token: str) -> None:
    try:
        payload = decode_token(refresh_token, "refresh")
    except UnauthorizedError:
        return  # already invalid; nothing to revoke
    await repo.revoke_refresh_token(db, payload["jti"])
    await db.commit()


async def request_password_reset(db: AsyncSession, email: str) -> None:
    user = await repo.get_user_by_email(db, email.lower())
    if user is not None:
        token = create_purpose_token(str(user.id), "password_reset", expire_minutes=30)
        log.info("password_reset_link", user_id=str(user.id), token=token)
    # Always succeed to avoid leaking which emails are registered.


async def confirm_password_reset(db: AsyncSession, token: str, new_password: str) -> None:
    payload = decode_purpose_token(token, "password_reset")
    user = await repo.get_user_by_id(db, payload["sub"])
    if user is None:
        raise UnauthorizedError("Invalid link")
    user.hashed_password = hash_password(new_password)
    await repo.revoke_all_for_user(db, user.id)  # force re-login everywhere
    await db.commit()


async def verify_email(db: AsyncSession, token: str) -> None:
    payload = decode_purpose_token(token, "verify_email")
    user = await repo.get_user_by_id(db, payload["sub"])
    if user is None:
        raise UnauthorizedError("Invalid link")
    user.is_email_verified = True
    await db.commit()


async def resend_verification(db: AsyncSession, user: User) -> None:
    if user.is_email_verified:
        raise ValidationFailedError("Your email is already verified")
    await _send_verification_email(user)


async def change_password(db: AsyncSession, user: User, current: str, new: str) -> None:
    if not user.hashed_password or not verify_password(current, user.hashed_password):
        raise UnauthorizedError("Current password is incorrect")
    user.hashed_password = hash_password(new)
    await repo.revoke_all_for_user(db, user.id)
    await db.commit()

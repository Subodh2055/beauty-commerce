"""Session lifetime rules: sliding idle window + absolute ceiling.

Both apply to every role. The idle window is the refresh token's own lifetime
(rotation slides it); the absolute cap rides on the `sst` claim so it survives
rotation and costs no query to check.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import Settings, settings
from app.core.exceptions import SessionExpiredError, TokenExpiredError, UnauthorizedError
from app.core.security import create_token, decode_token
from app.modules.auth.dependencies import _enforce_absolute_timeout


def _lifetime_minutes(token: str, kind: str) -> float:
    payload = decode_token(token, kind)  # type: ignore[arg-type]
    return (payload["exp"] - payload["iat"]) / 60


# --- token lifetimes -------------------------------------------------------


def test_refresh_token_lifetime_is_the_idle_window() -> None:
    token = create_token("user-1", "refresh")
    assert _lifetime_minutes(token, "refresh") == pytest.approx(
        settings.session_idle_timeout_minutes, abs=1
    )


def test_refresh_token_is_no_longer_long_lived() -> None:
    # Regression guard: this used to be 30 days.
    assert _lifetime_minutes(create_token("user-1", "refresh"), "refresh") <= 60


def test_access_token_never_outlives_the_idle_window() -> None:
    access = _lifetime_minutes(create_token("user-1", "access"), "access")
    assert access <= settings.session_idle_timeout_minutes


def test_expired_token_raises_token_expired(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "access_token_expire_minutes", -1)
    token = create_token("user-1", "access")
    with pytest.raises(TokenExpiredError) as exc:
        decode_token(token, "access")
    # Subclasses UnauthorizedError so existing handlers keep working.
    assert isinstance(exc.value, UnauthorizedError)
    assert exc.value.code == "token_expired"


# --- absolute cap ----------------------------------------------------------


def _payload(started_minutes_ago: float) -> dict[str, object]:
    started = datetime.now(UTC) - timedelta(minutes=started_minutes_ago)
    return {"sub": str(uuid.uuid4()), "sst": int(started.timestamp())}


def test_absolute_cap_allows_a_fresh_session() -> None:
    _enforce_absolute_timeout(_payload(started_minutes_ago=5))


def test_absolute_cap_allows_just_inside_the_ceiling() -> None:
    _enforce_absolute_timeout(
        _payload(started_minutes_ago=settings.session_absolute_timeout_hours * 60 - 2)
    )


def test_absolute_cap_rejects_past_the_ceiling() -> None:
    with pytest.raises(SessionExpiredError) as exc:
        _enforce_absolute_timeout(
            _payload(started_minutes_ago=settings.session_absolute_timeout_hours * 60 + 1)
        )
    assert exc.value.code == "session_expired"
    assert exc.value.status_code == 401


def test_absolute_cap_rejects_a_token_with_no_session_claim() -> None:
    # Tokens minted before this feature shipped must not be trusted forever.
    with pytest.raises(SessionExpiredError):
        _enforce_absolute_timeout({"sub": str(uuid.uuid4())})


def test_session_expired_is_distinguishable_from_plain_unauthorized() -> None:
    assert issubclass(SessionExpiredError, UnauthorizedError)
    assert SessionExpiredError.code != UnauthorizedError.code


# --- configuration guards --------------------------------------------------


def test_idle_window_may_not_exceed_absolute_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SESSION_IDLE_TIMEOUT_MINUTES", "600")
    monkeypatch.setenv("SESSION_ABSOLUTE_TIMEOUT_HOURS", "1")
    with pytest.raises(ValueError, match="SESSION_IDLE_TIMEOUT_MINUTES"):
        Settings(_env_file=None)


def test_access_token_may_not_exceed_idle_window(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120")
    monkeypatch.setenv("SESSION_IDLE_TIMEOUT_MINUTES", "40")
    with pytest.raises(ValueError, match="ACCESS_TOKEN_EXPIRE_MINUTES"):
        Settings(_env_file=None)


def test_defaults_are_forty_minutes_idle() -> None:
    s = Settings(_env_file=None)
    assert s.session_idle_timeout_minutes == 40
    assert s.session_absolute_timeout_hours == 8

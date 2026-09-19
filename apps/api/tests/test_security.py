import pytest

from app.core.exceptions import UnauthorizedError
from app.core.security import (
    create_purpose_token,
    create_token,
    decode_purpose_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_roundtrip() -> None:
    hashed = hash_password("s3cret!")
    assert hashed != "s3cret!"
    assert verify_password("s3cret!", hashed)
    assert not verify_password("wrong", hashed)


def test_access_token_roundtrip() -> None:
    token = create_token("user-1", "access", {"roles": ["CUSTOMER"]})
    payload = decode_token(token, "access")
    assert payload["sub"] == "user-1"
    assert payload["roles"] == ["CUSTOMER"]
    assert payload["jti"]


def test_refresh_token_rejected_as_access() -> None:
    token = create_token("user-1", "refresh")
    with pytest.raises(UnauthorizedError):
        decode_token(token, "access")


def test_explicit_jti_is_preserved() -> None:
    token = create_token("user-1", "refresh", jti="fixedjti123")
    assert decode_token(token, "refresh")["jti"] == "fixedjti123"


def test_purpose_token_roundtrip() -> None:
    token = create_purpose_token("user-1", "password_reset")
    assert decode_purpose_token(token, "password_reset")["sub"] == "user-1"


def test_purpose_token_wrong_purpose_rejected() -> None:
    token = create_purpose_token("user-1", "verify_email")
    with pytest.raises(UnauthorizedError):
        decode_purpose_token(token, "password_reset")


def test_purpose_token_not_usable_as_access() -> None:
    token = create_purpose_token("user-1", "verify_email")
    with pytest.raises(UnauthorizedError):
        decode_token(token, "access")

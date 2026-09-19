import pytest

from app.core.config import Settings


def test_cors_origins_parsed_from_comma_separated_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000, https://shop.example.com")
    s = Settings(_env_file=None)
    assert s.cors_origins == ["http://localhost:3000", "https://shop.example.com"]


def test_production_refuses_dev_jwt_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(_env_file=None)


def test_production_accepts_real_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "x" * 48)
    monkeypatch.setenv("JWT_REFRESH_SECRET", "y" * 48)
    assert Settings(_env_file=None).is_production

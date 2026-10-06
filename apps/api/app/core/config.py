from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_env: Literal["development", "test", "staging", "production"] = "development"
    app_name: str = "Beauty Commerce"
    api_v1_prefix: str = "/api/v1"
    log_level: str = "INFO"
    frontend_url: str = "http://localhost:3000"  # for building links in emails
    # NoDecode: read as a plain comma-separated string, split in the validator below.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    # Database
    database_url: str = "postgresql+asyncpg://beauty:beauty@localhost:5432/beauty_commerce"
    db_echo: bool = False

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    # Public catalog read cache (Redis). Writes bump a version key; TTL bounds
    # staleness for what isn't versioned (e.g. stock counts on product pages).
    cache_enabled: bool = True
    cache_ttl_seconds: int = 120
    # Signed-in carts untouched for this long are purged by the nightly beat job.
    cart_retention_days: int = 90
    # >0 adds a `system.ping` beat entry every N seconds. It stamps Redis, which
    # is how the super-admin system-health page knows beat → broker → worker is
    # flowing. 0 disables it (the page then reports beat as "not monitored").
    beat_heartbeat_seconds: int = 60

    # Rate limits (app/core/ratelimit.py). The multiplier scales every rule, e.g.
    # for load tests; nginx adds a coarse per-IP limit in front.
    rate_limit_enabled: bool = True
    rate_limit_multiplier: int = 1

    # Auth
    # Dev-only defaults; ≥32 bytes so HS256 doesn't warn. Must be overridden in production.
    jwt_secret: str = "dev-only-access-secret-change-me-in-production!!"
    jwt_refresh_secret: str = "dev-only-refresh-secret-change-me-in-production!"
    jwt_algorithm: str = "HS256"
    # Kept short so an access token cannot outlive an idled-out session by much:
    # the idle check happens at refresh time, so this bounds the overshoot.
    access_token_expire_minutes: int = 5
    # Session lifetime, enforced for every role.
    #   idle     — the session dies this long after its last use. Each refresh
    #              rotates the token and slides the window forward, so it is a
    #              true inactivity timeout.
    #   absolute — a hard ceiling measured from sign-in that activity cannot
    #              extend. Carried as the `sst` claim on both token types.
    session_idle_timeout_minutes: int = 40
    session_absolute_timeout_hours: int = 8

    # Payments: the stub gateway stands in for eSewa/Khalti/Stripe in dev and tests.
    payment_stub_enabled: bool = False
    payment_stub_secret: str = "dev-only-stub-secret"

    # Uploads / media
    upload_dir: str = "uploads"  # relative to apps/api (or absolute)
    # Prefix for uploaded-file URLs. Empty → relative "/uploads/<name>" (served
    # same-origin via the web app's rewrite / Nginx). Set to a CDN origin in prod.
    media_base_url: str = ""
    max_upload_mb: int = 5

    # Embeddings (semantic search, similar scents, recommendations). Provider:
    #   local  — offline feature-hashing model; no key, lexical-quality only (dev default)
    #   voyage — Voyage AI (voyage-3.5, 1024 dims)
    #   openai — OpenAI-compatible /embeddings (text-embedding-3-small at 1024 dims)
    # Vectors are stored at EMBEDDING_DIM (1024); switching provider or model
    # re-embeds everything on the next refresh (each row records its model).
    embedding_provider: Literal["local", "voyage", "openai"] = "local"
    embedding_model: str = ""  # empty → the provider's default
    embedding_api_key: str = ""
    embedding_base_url: str = ""  # empty → the provider's public endpoint
    embedding_timeout_seconds: float = 20.0
    # Queue a re-embed on every product write (tests turn this off and embed inline).
    embedding_enqueue_on_write: bool = True
    # Query embeddings are cached in Redis this long (same text → same vector).
    embedding_query_cache_seconds: int = 30 * 24 * 3600

    # n8n
    n8n_base_url: str = "http://localhost:5678"
    n8n_webhook_secret: str = ""
    # Full webhook URL that receives order events; empty disables n8n dispatch.
    n8n_webhook_url: str = ""

    # Email
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = "noreply@example.com"

    # Observability
    sentry_dsn: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def _check_session_windows(self) -> "Settings":
        if self.session_idle_timeout_minutes > self.session_absolute_timeout_hours * 60:
            raise ValueError(
                "SESSION_IDLE_TIMEOUT_MINUTES cannot exceed SESSION_ABSOLUTE_TIMEOUT_HOURS"
            )
        if self.access_token_expire_minutes > self.session_idle_timeout_minutes:
            raise ValueError(
                "ACCESS_TOKEN_EXPIRE_MINUTES cannot exceed SESSION_IDLE_TIMEOUT_MINUTES, "
                "or an access token would outlive the idle window"
            )
        return self

    @model_validator(mode="after")
    def _refuse_dev_secrets_in_production(self) -> "Settings":
        if self.app_env == "production" and (
            "dev-only" in self.jwt_secret or "dev-only" in self.jwt_refresh_secret
        ):
            raise ValueError("JWT_SECRET and JWT_REFRESH_SECRET must be set in production")
        if self.app_env == "production" and self.payment_stub_enabled:
            raise ValueError("PAYMENT_STUB_ENABLED must be off in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

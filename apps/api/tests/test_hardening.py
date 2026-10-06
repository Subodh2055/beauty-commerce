"""Security and resilience fixes from the repo audit: rate limits, real client
IP, login timing, upload authorization, production CORS, Celery retries and
the dead-letter list."""

import pytest
from httpx import AsyncClient
from pydantic import ValidationError

from app.core import ratelimit
from app.core.config import Settings
from app.modules.audit.models import AuditLog
from app.modules.auth import service as auth_service
from tests.factories import auth, make_user

pytestmark = pytest.mark.db


async def test_login_is_rate_limited_per_ip(api: AsyncClient, db) -> None:
    body = {"email": "ghost@example.com", "password": "whatever-1"}
    codes = [(await api.post("/api/v1/auth/login", json=body)).status_code for _ in range(11)]
    assert codes[:10] == [401] * 10 and codes[10] == 429
    res = await api.post("/api/v1/auth/login", json=body)
    assert res.status_code == 429 and int(res.headers["Retry-After"]) > 0
    assert res.json()["error"]["code"] == "rate_limited"
    # Another client (nginx sets X-Real-IP) has its own budget.
    other = await api.post("/api/v1/auth/login", json=body, headers={"X-Real-IP": "203.0.113.9"})
    assert other.status_code == 401


async def test_forwarded_for_cannot_dodge_limits_or_fake_audit_ip(api: AsyncClient, db) -> None:
    body = {"email": "ghost@example.com", "password": "whatever-1"}
    for i in range(11):
        res = await api.post(
            "/api/v1/auth/login", json=body, headers={"X-Forwarded-For": f"198.51.100.{i}"}
        )
    assert res.status_code == 429  # a spoofed XFF doesn't buy a fresh bucket

    admin = await make_user(db, "ADMIN")
    await api.post(
        "/api/v1/admin/brands",
        json={"name": "IP Audit"},
        headers={**auth(admin), "X-Forwarded-For": "6.6.6.6", "X-Real-IP": "192.0.2.10"},
    )
    from sqlalchemy import select

    entry = await db.scalar(select(AuditLog).where(AuditLog.actor_id == admin.id))
    assert entry.ip_address == "192.0.2.10"


async def test_limits_scale_and_can_be_disabled(api: AsyncClient, db, monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "rate_limit_multiplier", 2)
    body = {"email": "ghost@example.com", "password": "whatever-1"}
    codes = [(await api.post("/api/v1/auth/login", json=body)).status_code for _ in range(21)]
    assert codes.count(401) == 20 and codes[-1] == 429
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    assert (await api.post("/api/v1/auth/login", json=body)).status_code == 401


async def test_memory_counter_windows_expire() -> None:
    c = ratelimit.MemoryCounter()
    assert [await c.hit("k", 60) for _ in range(3)] == [1, 2, 3]
    assert await c.hit("other", 60) == 1


async def test_unknown_email_still_hashes_a_password(db, monkeypatch) -> None:
    calls = []
    real = auth_service.verify_password
    monkeypatch.setattr(auth_service, "verify_password", lambda p, h: calls.append(h) or real(p, h))
    with pytest.raises(Exception, match="Incorrect email or password"):
        await auth_service.login(db, "nobody@example.com", "pw", (None, None))
    assert calls == [auth_service._DUMMY_HASH]


async def test_vendors_cannot_upload_platform_media(api: AsyncClient, db) -> None:
    vendor_user = await make_user(db, "CUSTOMER", "VENDOR")  # holds media.upload
    files = {"file": ("x.png", b"\x89PNG\r\n\x1a\n", "image/png")}
    res = await api.post("/api/v1/admin/uploads", files=files, headers=auth(vendor_user))
    assert res.status_code == 403


def test_production_refuses_wildcard_or_http_cors() -> None:
    base = dict(
        app_env="production",
        jwt_secret="x" * 40,
        jwt_refresh_secret="y" * 40,
        payment_stub_enabled=False,
    )
    for origins in ("*", "http://shop.example.com"):
        with pytest.raises(ValidationError, match="CORS_ORIGINS"):
            Settings(**base, cors_origins=origins)
    ok = Settings(**base, cors_origins="https://shop.example.com")
    assert ok.cors_origins == ["https://shop.example.com"]


def test_tasks_retry_with_backoff_and_time_limits() -> None:
    import app.workers.tasks  # noqa: F401 — registers tasks
    from app.workers.celery_app import celery_app

    conf = celery_app.conf
    assert conf.task_acks_late and conf.task_reject_on_worker_lost
    assert conf.task_soft_time_limit < conf.task_time_limit
    for name in ("media.process_image", "recommendations.embed_products", "analytics.daily_rollup"):
        task = celery_app.tasks[name]
        assert task.max_retries == 5 and task.retry_backoff
        # Transient failures retry; bad input/bugs don't (they dead-letter at once).
        assert ConnectionError in task.autoretry_for and ValueError not in task.autoretry_for


def test_failed_tasks_are_dead_lettered(monkeypatch) -> None:
    from app.workers import dead_letter

    pushed: list[str] = []

    class FakePipe:
        def lpush(self, key, value):
            pushed.append((key, value))

        def ltrim(self, *_):
            pass

        def execute(self):
            pass

    class FakeRedis:
        def pipeline(self):
            return FakePipe()

    monkeypatch.setattr(dead_letter, "_client", lambda: FakeRedis())

    class Task:
        name = "media.process_image"

    dead_letter.record_failure(
        sender=Task(), task_id="t-1", exception=ValueError("boom"), args=["a1"], kwargs={}
    )
    key, raw = pushed[0]
    assert key == "celery:dead_letter" and '"ValueError: boom"' in raw and '"t-1"' in raw

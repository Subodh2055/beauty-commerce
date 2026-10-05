"""Beat schedule wiring (no broker or DB needed)."""

import importlib

import pytest

import app.workers.tasks  # noqa: F401 — registers the task names
from app.core.config import settings
from app.workers import celery_app as celery_module


def test_every_scheduled_task_is_registered() -> None:
    schedule = celery_module.celery_app.conf.beat_schedule
    assert {e["task"] for e in schedule.values()} >= {
        "analytics.daily_rollup",
        "maintenance.purge_expired",
    }
    for entry in schedule.values():
        assert entry["task"] in celery_module.celery_app.tasks


def test_heartbeat_is_on_by_default() -> None:
    # It feeds the super-admin system-health page (beat -> broker -> worker).
    entry = celery_module.celery_app.conf.beat_schedule["system-heartbeat"]
    assert entry == {"task": "system.ping", "schedule": 60.0}


@pytest.mark.parametrize(("seconds", "expected"), [(30, 30.0), (0, None)])
def test_heartbeat_interval_is_configurable(
    monkeypatch: pytest.MonkeyPatch, seconds: int, expected: float | None
) -> None:
    monkeypatch.setattr(settings, "beat_heartbeat_seconds", seconds)
    try:
        reloaded = importlib.reload(celery_module)
        entry = reloaded.celery_app.conf.beat_schedule.get("system-heartbeat")
        assert (entry or {}).get("schedule") == expected
    finally:
        monkeypatch.undo()
        importlib.reload(celery_module)

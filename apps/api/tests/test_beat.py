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


def test_heartbeat_is_off_by_default() -> None:
    assert "system-heartbeat" not in celery_module.celery_app.conf.beat_schedule


def test_heartbeat_can_be_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "beat_heartbeat_seconds", 30)
    try:
        reloaded = importlib.reload(celery_module)
        entry = reloaded.celery_app.conf.beat_schedule["system-heartbeat"]
        assert entry == {"task": "system.ping", "schedule": 30.0}
    finally:
        monkeypatch.undo()
        importlib.reload(celery_module)

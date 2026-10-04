"""Celery application. Run with:

celery -A app.workers.celery_app worker --loglevel=info
celery -A app.workers.celery_app beat --loglevel=info
"""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "beauty_commerce",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
)

# Times are UTC. Run exactly one beat process per deployment, or jobs fire twice.
beat_schedule: dict[str, dict] = {
    "analytics-daily-rollup": {
        "task": "analytics.daily_rollup",
        "schedule": crontab(hour=0, minute=15),
    },
    "maintenance-purge-expired": {
        "task": "maintenance.purge_expired",
        "schedule": crontab(hour=3, minute=0),
    },
    "media-retry-pending": {
        "task": "media.retry_pending",
        "schedule": crontab(minute="*/15"),
    },
}
if settings.beat_heartbeat_seconds > 0:
    beat_schedule["system-heartbeat"] = {
        "task": "system.ping",
        "schedule": float(settings.beat_heartbeat_seconds),
    }
celery_app.conf.beat_schedule = beat_schedule

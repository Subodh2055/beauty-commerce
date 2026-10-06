"""Dead-letter list for Celery tasks that failed for good.

Redis has no native dead-letter exchange, so a `task_failure` handler (which
fires only once retries are exhausted, not on each retry) records the task in
a capped Redis list, `celery:dead_letter`, and logs it at error level. The
super-admin system-health page shows the count and the latest entries; an
operator can re-run a task from its name and args.
"""

import json
import time

import redis
from celery.signals import task_failure

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

KEY = "celery:dead_letter"
KEEP = 1000


def _client() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, socket_timeout=2, protocol=2)


@task_failure.connect
def record_failure(sender=None, task_id=None, exception=None, args=None, kwargs=None, **_):
    entry = {
        "task": getattr(sender, "name", str(sender)),
        "task_id": task_id,
        "args": args,
        "kwargs": kwargs,
        "error": f"{type(exception).__name__}: {exception}"[:1000],
        "failed_at": time.time(),
    }
    log.error("task_dead_lettered", **{k: v for k, v in entry.items() if k != "kwargs"})
    try:
        client = _client()
        pipe = client.pipeline()
        pipe.lpush(KEY, json.dumps(entry, default=str))
        pipe.ltrim(KEY, 0, KEEP - 1)
        pipe.execute()
    except Exception as exc:  # noqa: BLE001 — the log line above is the fallback
        log.warning("dead_letter_store_failed", error=str(exc))

"""Deep system health for super admins: Postgres, Redis, Celery (workers,
queue depth, beat heartbeat), n8n and API latency.

Every probe has its own short timeout and reports instead of raising, so one
dead dependency shows up red on the page rather than taking the page down.
"""

import asyncio
import json
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from urllib.parse import urlparse

import httpx
import redis.asyncio as aioredis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import metrics
from app.core.config import settings
from app.core.logging import get_logger
from app.modules.health.schemas import (
    ApiLatency,
    CeleryWorker,
    Component,
    QueueDepth,
    SystemHealth,
)

log = get_logger(__name__)

PROBE_TIMEOUT = 2.0
# The DB probe sizes the database, which can take a moment on a cold cache.
DB_TIMEOUT = 5.0
BEAT_HEARTBEAT_KEY = "system:beat:last_ping"  # written by workers.tasks.ping
DEAD_LETTER_KEY = "celery:dead_letter"  # written by workers.dead_letter
_RANK = {"ok": 0, "unknown": 1, "degraded": 2, "down": 3}


async def _timed[T](
    fn: Callable[[], Awaitable[T]], timeout: float = PROBE_TIMEOUT
) -> tuple[T, float]:
    start = time.perf_counter()
    result = await asyncio.wait_for(fn(), timeout)
    return result, round((time.perf_counter() - start) * 1000, 1)


def _redis(url: str) -> aioredis.Redis:
    # protocol=2: works against old Redis builds (no HELLO) as well as current ones.
    return aioredis.from_url(
        url, socket_connect_timeout=PROBE_TIMEOUT, socket_timeout=PROBE_TIMEOUT, protocol=2
    )


async def _postgres(db: AsyncSession) -> Component:
    try:

        async def probe():
            return (
                await db.execute(
                    text(
                        "SELECT version(), pg_database_size(current_database()), "
                        "(SELECT count(*) FROM pg_stat_activity "
                        " WHERE datname = current_database()), "
                        "current_setting('max_connections')::int, "
                        "(SELECT version_num FROM alembic_version LIMIT 1)"
                    )
                )
            ).one()

        (version, size, conns, max_conns, revision), ms = await _timed(probe, DB_TIMEOUT)
        used = conns / max_conns if max_conns else 0
        return Component(
            key="postgres",
            name="PostgreSQL",
            status="degraded" if used > 0.8 or ms > 500 else "ok",
            latency_ms=ms,
            summary=f"{conns}/{max_conns} connections · {size / 1024 / 1024:,.0f} MB",
            details={
                "version": str(version).split(" on ")[0],
                "database_size_mb": round(size / 1024 / 1024, 1),
                "connections": conns,
                "max_connections": max_conns,
                "migration": revision,
            },
        )
    except Exception as exc:  # noqa: BLE001 — report, never raise
        log.warning("health_postgres_failed", error=repr(exc))
        await db.rollback()
        timed_out = isinstance(exc, TimeoutError)
        return Component(
            key="postgres",
            name="PostgreSQL",
            status="down",
            summary=f"No answer within {DB_TIMEOUT:.0f} s" if timed_out else "Unreachable",
            error=str(exc) or type(exc).__name__,
        )


async def _redis_component() -> tuple[Component, aioredis.Redis | None]:
    client = _redis(settings.redis_url)
    try:
        info, ms = await _timed(client.info)
        return (
            Component(
                key="redis",
                name="Redis",
                status="degraded" if ms > 200 else "ok",
                latency_ms=ms,
                summary=f"{info.get('used_memory_human', '?')} used · "
                f"{info.get('connected_clients', '?')} clients",
                details={
                    "version": info.get("redis_version"),
                    "used_memory": info.get("used_memory_human"),
                    "connected_clients": info.get("connected_clients"),
                    "uptime_days": info.get("uptime_in_days"),
                    "cache_enabled": settings.cache_enabled,
                },
            ),
            client,
        )
    except Exception as exc:  # noqa: BLE001
        await client.aclose()
        return (
            Component(
                key="redis", name="Redis", status="down", summary="Unreachable", error=str(exc)
            ),
            None,
        )


def _inspect_workers() -> tuple[dict, dict, dict]:
    from app.workers.celery_app import celery_app

    insp = celery_app.control.inspect(timeout=1.0)
    return insp.ping() or {}, insp.stats() or {}, insp.active() or {}


async def _broker_down() -> str | None:
    """Quick reachability check, so a dead broker doesn't cost an inspect timeout."""
    if urlparse(settings.celery_broker_url).scheme not in ("redis", "rediss"):
        return None
    client = _redis(settings.celery_broker_url)
    try:
        await asyncio.wait_for(client.ping(), PROBE_TIMEOUT)
        return None
    except Exception as exc:  # noqa: BLE001
        return str(exc) or type(exc).__name__
    finally:
        await client.aclose()


async def _celery() -> tuple[Component, list[CeleryWorker], list[QueueDepth]]:
    workers: list[CeleryWorker] = []
    queues: list[QueueDepth] = []
    down = await _broker_down()
    if down:
        return (
            Component(
                key="celery",
                name="Celery workers",
                status="down",
                summary="Broker unreachable",
                error=down,
            ),
            [],
            [QueueDepth(name="default")],
        )
    try:
        start = time.perf_counter()
        pings, stats, active = await asyncio.wait_for(
            asyncio.to_thread(_inspect_workers), PROBE_TIMEOUT + 1
        )
        ms = round((time.perf_counter() - start) * 1000, 1)
        for name in sorted(pings):
            s = stats.get(name, {})
            total = s.get("total") or {}
            workers.append(
                CeleryWorker(
                    name=name,
                    active_tasks=len(active.get(name, [])),
                    processed=sum(total.values()) if isinstance(total, dict) else None,
                    concurrency=(s.get("pool") or {}).get("max-concurrency"),
                )
            )
    except Exception as exc:  # noqa: BLE001
        return (
            Component(
                key="celery",
                name="Celery workers",
                status="down",
                summary="Broker unreachable",
                error=str(exc),
            ),
            [],
            [],
        )

    broker = urlparse(settings.celery_broker_url)
    if broker.scheme in ("redis", "rediss"):
        client = _redis(settings.celery_broker_url)
        try:
            depth = await asyncio.wait_for(client.llen("default"), PROBE_TIMEOUT)
            queues.append(QueueDepth(name="default", pending=int(depth)))
        except Exception as exc:  # noqa: BLE001
            log.warning("queue_depth_failed", error=str(exc))
            queues.append(QueueDepth(name="default"))
        finally:
            await client.aclose()
    else:
        queues.append(QueueDepth(name="default"))

    backlog = sum(q.pending or 0 for q in queues)
    status = "down" if not workers else "degraded" if backlog > 100 else "ok"
    return (
        Component(
            key="celery",
            name="Celery workers",
            status=status,
            latency_ms=ms,
            summary=(
                f"{len(workers)} worker{'s' if len(workers) != 1 else ''} · {backlog} queued"
                if workers
                else "No worker answered"
            ),
            details={"broker": broker.scheme, "queued": backlog},
        ),
        workers,
        queues,
    )


async def _beat(client: aioredis.Redis | None) -> Component:
    interval = settings.beat_heartbeat_seconds
    if interval <= 0:
        return Component(
            key="beat",
            name="Celery beat",
            status="unknown",
            summary="Not monitored (BEAT_HEARTBEAT_SECONDS=0)",
        )
    if client is None:
        return Component(key="beat", name="Celery beat", status="unknown", summary="Redis is down")
    try:
        raw = await asyncio.wait_for(client.get(BEAT_HEARTBEAT_KEY), PROBE_TIMEOUT)
    except Exception as exc:  # noqa: BLE001
        return Component(
            key="beat", name="Celery beat", status="unknown", summary="Unknown", error=str(exc)
        )
    if raw is None:
        return Component(key="beat", name="Celery beat", status="down", summary="No heartbeat yet")
    age = time.time() - float(raw)
    return Component(
        key="beat",
        name="Celery beat",
        status="ok" if age <= interval * 3 else "down",
        summary=f"Last heartbeat {int(age)}s ago",
        details={"interval_seconds": interval, "seconds_since": int(age)},
    )


async def _dead_letters(client: aioredis.Redis | None) -> Component:
    """Tasks that failed after all retries (workers.dead_letter)."""
    if client is None:
        return Component(
            key="dead_letter", name="Failed tasks", status="unknown", summary="Redis is down"
        )
    try:
        count = await asyncio.wait_for(client.llen(DEAD_LETTER_KEY), PROBE_TIMEOUT)
        latest = await asyncio.wait_for(client.lindex(DEAD_LETTER_KEY, 0), PROBE_TIMEOUT)
    except Exception as exc:  # noqa: BLE001
        return Component(
            key="dead_letter",
            name="Failed tasks",
            status="unknown",
            summary="Unknown",
            error=str(exc),
        )
    if not count:
        return Component(key="dead_letter", name="Failed tasks", status="ok", summary="None")
    last = json.loads(latest) if latest else {}
    return Component(
        key="dead_letter",
        name="Failed tasks",
        status="degraded",
        summary=f"{count} failed after retries · latest: {last.get('task', '?')}",
        details={"count": count, "latest_error": str(last.get("error", ""))[:200]},
    )


async def _n8n() -> Component:
    if not settings.n8n_webhook_url:
        return Component(
            key="n8n",
            name="n8n",
            status="unknown",
            summary="Not configured: notifications go by email or log",
        )
    url = settings.n8n_base_url.rstrip("/") + "/healthz"
    try:
        async with httpx.AsyncClient(timeout=PROBE_TIMEOUT) as client:
            res, ms = await _timed(lambda: client.get(url))
        return Component(
            key="n8n",
            name="n8n",
            status="ok" if res.status_code == 200 else "degraded",
            latency_ms=ms,
            summary=f"HTTP {res.status_code}",
            details={"url": settings.n8n_base_url},
        )
    except Exception as exc:  # noqa: BLE001
        return Component(
            key="n8n",
            name="n8n",
            status="down",
            summary="Unreachable",
            error=str(exc),
            details={"url": settings.n8n_base_url},
        )


async def system_health(db: AsyncSession) -> SystemHealth:
    postgres, (redis_c, client), (celery_c, workers, queues), n8n = await asyncio.gather(
        _postgres(db), _redis_component(), _celery(), _n8n()
    )
    try:
        beat = await _beat(client)
        dead = await _dead_letters(client)
    finally:
        if client is not None:
            await client.aclose()

    snap = metrics.snapshot()
    api_status = "degraded" if snap["error_rate"] > 0.02 or snap["p95_ms"] > 1000 else "ok"
    api = Component(
        key="api",
        name="API",
        status=api_status,
        latency_ms=snap["p95_ms"],
        summary=f"p95 {snap['p95_ms']} ms · {snap['per_minute']} req/min",
        details={"error_rate": snap["error_rate"], "requests_5m": snap["requests"]},
    )
    components = [api, postgres, redis_c, celery_c, beat, dead, n8n]
    worst = max(components, key=lambda c: _RANK[c.status]).status
    return SystemHealth(
        status="ok" if worst == "unknown" else worst,
        checked_at=datetime.now(UTC),
        environment=settings.app_env,
        components=components,
        workers=workers,
        queues=queues,
        api=ApiLatency(**snap),
    )

import asyncio
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import redis
import sqlalchemy.exc
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401 — register every mapper before querying
from app.core.config import settings
from app.core.logging import get_logger
from app.integrations.embeddings import EmbeddingError
from app.modules.analytics import service as analytics_service
from app.modules.auth import repository as auth_repo
from app.modules.cart import service as cart_service
from app.modules.catalog import cache as _catalog_cache  # noqa: F401 — invalidation listeners
from app.modules.media import service as media_service
from app.modules.recommendations import service as recommendations_service
from app.workers import dead_letter as _dead_letter  # noqa: F401 — failure signal
from app.workers.celery_app import celery_app

log = get_logger(__name__)

# Retried with exponential backoff + jitter: failures that may pass on their own
# (broker/DB/provider hiccups). Anything else — bad input, bugs — fails at once
# and goes straight to the dead-letter list (workers/dead_letter.py).
TRANSIENT = (
    ConnectionError,
    TimeoutError,
    OSError,
    sqlalchemy.exc.OperationalError,
    sqlalchemy.exc.InterfaceError,
    EmbeddingError,
)


def _run_with_session[T](fn: Callable[[AsyncSession], Awaitable[T]]) -> T:
    """Run async DB work from a sync Celery task.

    Every call gets a fresh event loop (asyncio.run), so it also gets its own
    NullPool engine: the app's pooled engine holds connections bound to whichever
    loop opened them and cannot be shared across loops.
    """

    async def main() -> T:
        engine = create_async_engine(settings.database_url, poolclass=NullPool)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                return await fn(session)
        finally:
            await engine.dispose()

    return asyncio.run(main())


BEAT_HEARTBEAT_KEY = "system:beat:last_ping"


@celery_app.task(name="system.ping")
def ping() -> str:
    """Beat heartbeat (and smoke test of the worker/broker wiring). Stamps Redis
    so the system-health page can tell beat → broker → worker is flowing."""
    try:
        client = redis.Redis.from_url(settings.redis_url, socket_timeout=2, protocol=2)
        client.set(BEAT_HEARTBEAT_KEY, str(time.time()), ex=86400)
    except Exception as exc:  # noqa: BLE001 — a heartbeat must never fail the worker
        log.warning("heartbeat_store_failed", error=str(exc))
    log.info("ping_task")
    return "pong"


@celery_app.task(
    name="analytics.daily_rollup",
    autoretry_for=TRANSIENT,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def daily_rollup() -> list[str]:
    """Persist yesterday's platform sales (UTC) to analytics_daily, plus any day
    of the past week a missed run left out. Admin analytics read these rows for
    closed days and only compute today live."""

    async def work(db: AsyncSession) -> list[str]:
        return [d.isoformat() for d in await analytics_service.rollup(db)]

    days = _run_with_session(work)
    log.info("analytics_daily_rollup", days=days)
    return days


@celery_app.task(
    name="maintenance.purge_expired",
    autoretry_for=TRANSIENT,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def purge_expired() -> dict[str, int]:
    """Delete lapsed refresh tokens and carts idle past CART_RETENTION_DAYS."""
    now = datetime.now(UTC)
    cart_cutoff = now - timedelta(days=settings.cart_retention_days)

    async def work(db: AsyncSession) -> dict[str, int]:
        async with db.begin():
            tokens = await auth_repo.purge_expired_refresh_tokens(db, now)
            carts = await cart_service.purge_stale_items(db, cart_cutoff)
        return {"refresh_tokens": tokens, "cart_items": carts}

    counts = _run_with_session(work)
    log.info("maintenance_purge_expired", **counts)
    return counts


@celery_app.task(
    name="media.process_image",
    autoretry_for=TRANSIENT,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def process_image(asset_id: str) -> str:
    """Resize an upload into WebP renditions (see media/service.py)."""
    status = _run_with_session(lambda db: media_service.process_asset(db, uuid.UUID(asset_id)))
    log.info("media_processed", asset_id=asset_id, status=status)
    return status


@celery_app.task(name="media.retry_pending")
def retry_pending_media() -> int:
    """Re-enqueue uploads stuck in PENDING (e.g. the broker was down at upload)."""
    count = _run_with_session(media_service.retry_pending)
    if count:
        log.info("media_retry_pending", count=count)
    return count


@celery_app.task(
    name="recommendations.embed_products",
    autoretry_for=TRANSIENT,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def embed_products(product_ids: list[str]) -> int:
    """Re-embed products after they were saved (queued by recommendations.events)."""

    async def work(db: AsyncSession) -> int:
        return await recommendations_service.embed_products(db, [uuid.UUID(i) for i in product_ids])

    return _run_with_session(work)


@celery_app.task(
    name="recommendations.refresh",
    autoretry_for=TRANSIENT,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def refresh_embeddings() -> int:
    """Nightly: embed anything new or stale (text or model changed). Cheap when
    nothing changed: unchanged products are skipped by content hash."""

    async def work(db: AsyncSession) -> int:
        return await recommendations_service.embed_products(db)

    count = _run_with_session(work)
    log.info("embeddings_refreshed", count=count)
    return count

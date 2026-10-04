import asyncio
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, time, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401 — register every mapper before querying
from app.core.config import settings
from app.core.logging import get_logger
from app.modules.auth import repository as auth_repo
from app.modules.cart import service as cart_service
from app.modules.catalog import cache as _catalog_cache  # noqa: F401 — invalidation listeners
from app.modules.media import service as media_service
from app.modules.orders import repository as orders_repo
from app.workers.celery_app import celery_app

log = get_logger(__name__)


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


@celery_app.task(name="system.ping")
def ping() -> str:
    """Smoke-test task to verify the worker/broker wiring."""
    log.info("ping_task")
    return "pong"


@celery_app.task(name="analytics.daily_rollup")
def daily_rollup() -> dict[str, dict[str, str | int]]:
    """Placeholder nightly rollup: per-status order count and value for yesterday (UTC).

    Only logs for now; persist to an analytics table once reporting needs it.
    """
    today = datetime.combine(datetime.now(UTC).date(), time.min, tzinfo=UTC)
    start, end = today - timedelta(days=1), today

    async def work(db: AsyncSession) -> dict[str, dict[str, str | int]]:
        totals = await orders_repo.order_totals_by_status(db, start, end)
        return {s: {"orders": n, "value": str(v)} for s, (n, v) in totals.items()}

    summary = _run_with_session(work)
    log.info("analytics_daily_rollup", day=start.date().isoformat(), by_status=summary)
    return summary


@celery_app.task(name="maintenance.purge_expired")
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


@celery_app.task(name="media.process_image")
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

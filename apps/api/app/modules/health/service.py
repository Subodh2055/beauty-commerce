import redis.asyncio as aioredis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.modules.health.schemas import HealthResponse

log = get_logger(__name__)


async def _check_db(db: AsyncSession) -> bool:
    try:
        await db.execute(text("SELECT 1"))
        return True
    except Exception as exc:  # noqa: BLE001 - readiness must never raise
        log.warning("db_unreachable", error=str(exc))
        return False


async def _check_redis() -> bool:
    client = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
    try:
        return bool(await client.ping())
    except Exception as exc:  # noqa: BLE001
        log.warning("redis_unreachable", error=str(exc))
        return False
    finally:
        await client.aclose()


async def readiness(db: AsyncSession) -> HealthResponse:
    db_ok = await _check_db(db)
    redis_ok = await _check_redis()
    return HealthResponse(
        status="ok" if db_ok and redis_ok else "degraded",
        database=db_ok,
        redis=redis_ok,
    )

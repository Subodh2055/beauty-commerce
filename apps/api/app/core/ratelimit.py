"""Fixed-window rate limits, shared across API workers through Redis.

    @router.post("/login", dependencies=[limit("login", 10, 60)])

Each rule counts requests per key (client IP by default, or the signed-in
user) in a `window`-second bucket and answers 429 with Retry-After once
`limit` is passed. If Redis is unreachable the limiter falls back to a
per-process counter rather than failing open entirely or blocking requests.

nginx applies a coarser per-IP limit in front (infrastructure/nginx); these
rules are the precise, per-endpoint ones.
"""

import time
from typing import Any, Literal, Protocol

import redis.asyncio as aioredis
from fastapi import Depends, Request

from app.core.config import settings
from app.core.exceptions import RateLimitedError
from app.core.logging import get_logger
from app.core.security import decode_token

log = get_logger(__name__)


class Counter(Protocol):
    async def hit(self, key: str, window: int) -> int: ...


class MemoryCounter:
    def __init__(self) -> None:
        self._data: dict[str, tuple[int, float]] = {}

    async def hit(self, key: str, window: int) -> int:
        now = time.monotonic()
        count, expires = self._data.get(key, (0, now + window))
        if expires <= now:
            count, expires = 0, now + window
        count += 1
        self._data[key] = (count, expires)
        if len(self._data) > 50_000:  # bound memory under a flood
            self._data = {k: v for k, v in self._data.items() if v[1] > now}
        return count


class RedisCounter:
    def __init__(self, url: str) -> None:
        self._client = aioredis.from_url(
            url, socket_connect_timeout=0.5, socket_timeout=0.5, protocol=2
        )
        self._fallback = MemoryCounter()

    async def hit(self, key: str, window: int) -> int:
        try:
            pipe = self._client.pipeline(transaction=True)
            pipe.incr(key)
            pipe.expire(key, window, nx=True)
            count, _ = await pipe.execute()
            return int(count)
        except Exception as exc:  # noqa: BLE001 — never let the limiter take the API down
            log.warning("ratelimit_redis_unavailable", error=str(exc))
            return await self._fallback.hit(key, window)


_counter: Counter | None = None


def get_counter() -> Counter:
    global _counter
    if _counter is None:
        _counter = RedisCounter(settings.redis_url) if settings.cache_enabled else MemoryCounter()
    return _counter


def set_counter(counter: Counter | None) -> Counter | None:
    """Swap the backend (tests); returns the previous one."""
    global _counter
    previous, _counter = _counter, counter
    return previous


def client_ip(request: Request) -> str:
    """The caller's IP as nginx saw it. nginx sets X-Real-IP from the
    connection (overwriting anything the client sent); X-Forwarded-For's first
    entry is client-controlled, so it is never trusted here."""
    real = request.headers.get("x-real-ip", "").strip()
    if real:
        return real
    return request.client.host if request.client else "unknown"


def _user_key(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    try:
        return "u:" + str(decode_token(auth[7:], "access")["sub"])
    except Exception:  # noqa: BLE001 — bad tokens fall back to the IP
        return None


def limit(name: str, limit: int, window: int, by: Literal["ip", "user"] = "ip") -> Any:
    """Dependency: at most `limit` calls per `window` seconds per key."""

    async def check(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return
        key = client_ip(request)
        if by == "user":
            key = _user_key(request) or key
        bucket = int(time.time() // window)
        count = await get_counter().hit(f"rl:{name}:{key}:{bucket}", window)
        allowed = limit * settings.rate_limit_multiplier
        if count > allowed:
            retry = window - int(time.time()) % window
            raise RateLimitedError(
                "Too many requests. Please wait a moment and try again.",
                headers={"Retry-After": str(retry)},
            )

    check.rate_limit = (name, limit, window)  # type: ignore[attr-defined]
    return Depends(check)

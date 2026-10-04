"""Read-through cache (Redis in production, in-memory in tests).

Keys are namespaced by a version counter — `catalog:v7:products:...` — so
invalidating a namespace is one INCR instead of a key scan; entries written under
an old version are never read again and expire by TTL.

A cache outage must never fail a request: reads become misses, writes are dropped.
"""

import asyncio
import hashlib
import time
from collections.abc import Awaitable, Callable
from typing import Protocol

import redis.asyncio as aioredis
from pydantic import TypeAdapter

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)


class CacheBackend(Protocol):
    async def get(self, key: str) -> bytes | None: ...
    async def set(self, key: str, value: bytes, ttl: int) -> None: ...
    async def incr(self, key: str) -> int: ...


class RedisCache:
    def __init__(self, url: str) -> None:
        self._client = aioredis.from_url(url, socket_connect_timeout=1, socket_timeout=1)

    async def get(self, key: str) -> bytes | None:
        return await self._client.get(key)

    async def set(self, key: str, value: bytes, ttl: int) -> None:
        await self._client.set(key, value, ex=ttl)

    async def incr(self, key: str) -> int:
        return int(await self._client.incr(key))


class MemoryCache:
    """Process-local backend for tests and cache-less local runs."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[bytes, float | None]] = {}

    async def get(self, key: str) -> bytes | None:
        item = self._data.get(key)
        if item is None:
            return None
        value, expires = item
        if expires is not None and expires < time.monotonic():
            del self._data[key]
            return None
        return value

    async def set(self, key: str, value: bytes, ttl: int) -> None:
        self._data[key] = (value, time.monotonic() + ttl)

    async def incr(self, key: str) -> int:
        current = int((await self.get(key)) or 0) + 1
        self._data[key] = (str(current).encode(), None)
        return current


class NullCache:
    async def get(self, key: str) -> bytes | None:
        return None

    async def set(self, key: str, value: bytes, ttl: int) -> None:
        return None

    async def incr(self, key: str) -> int:
        return 0


_backend: CacheBackend | None = None


def get_backend() -> CacheBackend:
    global _backend
    if _backend is None:
        _backend = RedisCache(settings.redis_url) if settings.cache_enabled else NullCache()
    return _backend


def set_backend(backend: CacheBackend | None) -> CacheBackend | None:
    """Swap the backend (tests); returns the previous one."""
    global _backend
    previous, _backend = _backend, backend
    return previous


def _version_key(namespace: str) -> str:
    return f"{namespace}:version"


async def _version(namespace: str) -> int:
    try:
        raw = await get_backend().get(_version_key(namespace))
    except Exception as exc:  # noqa: BLE001 — cache is best-effort
        log.warning("cache_unavailable", op="version", error=str(exc))
        return -1  # sentinel: skip caching this call
    return int(raw or 0)


def make_key(*parts: object) -> str:
    """Stable, bounded key from arbitrary parts (filters can be long)."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha1(raw.encode(), usedforsecurity=False).hexdigest()


async def get_or_load[T](
    namespace: str,
    key: str,
    adapter: TypeAdapter[T],
    loader: Callable[[], Awaitable[T]],
    ttl: int | None = None,
) -> T:
    """Return the cached value for `key`, or run `loader` and cache its result."""
    version = await _version(namespace)
    if version < 0:
        return await loader()
    full_key = f"{namespace}:v{version}:{key}"
    backend = get_backend()
    try:
        hit = await backend.get(full_key)
    except Exception as exc:  # noqa: BLE001
        log.warning("cache_unavailable", op="get", error=str(exc))
        hit = None
    if hit is not None:
        return adapter.validate_json(hit)

    value = await loader()
    try:
        await backend.set(full_key, adapter.dump_json(value), ttl or settings.cache_ttl_seconds)
    except Exception as exc:  # noqa: BLE001
        log.warning("cache_unavailable", op="set", error=str(exc))
    return value


async def invalidate(namespace: str) -> None:
    try:
        await get_backend().incr(_version_key(namespace))
    except Exception as exc:  # noqa: BLE001
        log.warning("cache_unavailable", op="invalidate", error=str(exc))


_pending: set[asyncio.Task[None]] = set()


def invalidate_soon(namespace: str) -> None:
    """Schedule `invalidate` from sync code (SQLAlchemy events) on the running loop."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # no loop (sync script): nothing cached in-process to worry about
    task = loop.create_task(invalidate(namespace))
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def drain() -> None:
    """Wait for scheduled invalidations (tests, and scripts before they exit)."""
    while _pending:
        await asyncio.gather(*list(_pending))

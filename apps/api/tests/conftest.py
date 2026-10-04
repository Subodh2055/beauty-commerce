"""Shared fixtures.

Tests marked `db` run against a real Postgres named by TEST_DATABASE_URL. The suite
DROPS and recreates that database once per run, so its name must end in `_test`.
Without the variable those tests are skipped and the rest still run anywhere.

Each `db` test gets a session inside an outer transaction that is rolled back
afterwards; service-level `commit()` calls become savepoint releases
(join_transaction_mode="create_savepoint"), so tests never see each other's rows.
"""

import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import asyncpg
import pytest
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from app.core import cache
from app.core.database import get_db
from app.main import app

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
API_ROOT = Path(__file__).resolve().parents[1]


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if TEST_DATABASE_URL:
        return
    skip = pytest.mark.skip(reason="TEST_DATABASE_URL not set")
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(autouse=True)
def memory_cache() -> Iterator[cache.MemoryCache]:
    """Every test gets a fresh in-process cache, so nothing touches a real Redis."""
    backend = cache.MemoryCache()
    previous = cache.set_backend(backend)
    yield backend
    cache.set_backend(previous)


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def _recreate_database(url: str) -> None:
    u = make_url(url)
    admin = await asyncpg.connect(
        host=u.host, port=u.port, user=u.username, password=u.password, database="postgres"
    )
    try:
        await admin.execute(f'DROP DATABASE IF EXISTS "{u.database}" WITH (FORCE)')
        await admin.execute(f'CREATE DATABASE "{u.database}"')
    finally:
        await admin.close()


@pytest.fixture(scope="session")
def migrated_db() -> str:
    """Fresh database at head. Goes up, all the way down, and up again, so every
    run also proves each migration's downgrade works."""
    assert TEST_DATABASE_URL
    if not (make_url(TEST_DATABASE_URL).database or "").endswith("_test"):
        raise RuntimeError("TEST_DATABASE_URL must name a database ending in _test")
    asyncio.run(_recreate_database(TEST_DATABASE_URL))

    cfg = Config(str(API_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_ROOT / "alembic"))
    cfg.attributes["database_url"] = TEST_DATABASE_URL
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    return TEST_DATABASE_URL


@pytest.fixture
async def db(migrated_db: str) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(migrated_db, poolclass=NullPool)
    async with engine.connect() as conn:
        outer = await conn.begin()
        session = AsyncSession(
            bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        try:
            yield session
        finally:
            await session.close()
            await outer.rollback()
    await engine.dispose()


@pytest.fixture
async def api(db: AsyncSession) -> AsyncIterator[AsyncClient]:
    """HTTP client whose requests share the test's rolled-back session."""

    async def _get_db() -> AsyncIterator[AsyncSession]:
        try:
            yield db
        finally:
            # In production each request gets a fresh session; here they share
            # one, so drop the per-request audit actor between requests.
            db.info.pop("audit_context", None)

    app.dependency_overrides[get_db] = _get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_db, None)

"""Embed the catalog for semantic search, similar scents and recommendations.

    python -m app.scripts.embed_products          # new or changed products only
    python -m app.scripts.embed_products --force  # everything (after switching provider)
    python -m app.scripts.embed_products --status # how much is embedded

Uses EMBEDDING_PROVIDER / EMBEDDING_MODEL / EMBEDDING_API_KEY from .env.
Safe to re-run: unchanged products are skipped by content hash.
"""

import argparse
import asyncio

import app.models  # noqa: F401 — register every mapper
from app.core import cache
from app.core.database import SessionLocal
from app.modules.recommendations import service


async def main(force: bool, status_only: bool) -> None:
    async with SessionLocal() as db:
        if not status_only:
            count = await service.embed_products(db, force=force)
            print(f"Embedded {count} product(s).")
        s = await service.index_status(db)
        print(
            f"{s.embedded}/{s.products} products embedded with {s.provider}:{s.model}"
            + (f" ({s.stale} stale or missing)" if s.stale else "")
        )
    await cache.drain()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--force", action="store_true", help="re-embed every product")
    parser.add_argument("--status", action="store_true", help="only report coverage")
    args = parser.parse_args()
    asyncio.run(main(args.force, args.status))

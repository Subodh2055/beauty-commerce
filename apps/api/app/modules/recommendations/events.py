"""Queue a re-embed whenever a product (or its note pyramid) commits.

`after_flush` collects the product ids touched in the session; `after_commit`
hands them to the worker (`recommendations.embed_products`). A rollback drops
them. Publishing runs on a thread so a slow broker never blocks the request;
if the broker is down the nightly `recommendations.refresh` catches up, since
it re-embeds anything whose text hash no longer matches.

Brand and family renames aren't tracked here (they touch many products at
once); the nightly refresh picks those up the same way.
"""

import asyncio
import uuid

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.modules.catalog.models import Product, ProductNote

log = get_logger(__name__)
_KEY = "embed_product_ids"
# Columns that change a product's embedded text.
TEXT_COLUMNS = {
    "name",
    "short_description",
    "description",
    "brand_id",
    "fragrance_family_id",
    "gender",
    "tags",
}


def _touched(obj: object) -> uuid.UUID | None:
    if isinstance(obj, ProductNote):
        return obj.product_id
    if isinstance(obj, Product):
        state = inspect(obj)
        if state.pending or not state.persistent:
            return obj.id
        if any(state.attrs[c].history.has_changes() for c in TEXT_COLUMNS):
            return obj.id
    return None


def _after_flush(session: Session, _ctx: object) -> None:
    ids: set = session.info.setdefault(_KEY, set())
    for obj in (*session.new, *session.dirty, *session.deleted):
        pid = _touched(obj)
        if pid is not None and not (isinstance(obj, Product) and obj in session.deleted):
            ids.add(pid)


def _send(ids: list[str]) -> None:
    from app.workers.celery_app import celery_app

    try:
        celery_app.send_task(
            "recommendations.embed_products", args=[ids], retry=False, ignore_result=True
        )
    except Exception as exc:  # noqa: BLE001 — the nightly refresh is the safety net
        log.warning("embed_enqueue_failed", count=len(ids), error=str(exc))


def _after_commit(session: Session) -> None:
    ids = session.info.pop(_KEY, None)
    if not ids or not settings.embedding_enqueue_on_write:
        return
    payload = sorted(str(i) for i in ids)
    try:
        asyncio.get_running_loop().run_in_executor(None, _send, payload)
    except RuntimeError:  # no event loop (scripts, the worker itself)
        _send(payload)


def _after_rollback(session: Session) -> None:
    session.info.pop(_KEY, None)


event.listen(Session, "after_flush", _after_flush)
event.listen(Session, "after_commit", _after_commit)
event.listen(Session, "after_soft_rollback", lambda s, _tx: _after_rollback(s))

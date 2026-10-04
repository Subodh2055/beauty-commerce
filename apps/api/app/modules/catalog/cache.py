"""Invalidate the public catalog cache whenever catalog data commits.

`after_flush` marks the session when a catalog row changed; `after_commit` bumps
the namespace version. A rollback clears the mark, so aborted writes don't evict.

Stock movements are deliberately ignored unless a variant crosses zero (which
flips `in_stock`): otherwise every checkout would empty the cache. Exact counts on
product pages can therefore lag by up to CACHE_TTL_SECONDS; checkout always
re-reads and locks stock, so that lag never oversells.
"""

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.core import cache
from app.modules.catalog.models import (
    Brand,
    Category,
    FragranceFamily,
    FragranceNote,
    Product,
    ProductImage,
    ProductNote,
    ProductVariant,
)
from app.modules.catalog.service import CACHE_NS
from app.modules.vendors.models import Vendor

CATALOG_MODELS = (
    Brand,
    Category,
    FragranceFamily,
    FragranceNote,
    Product,
    ProductImage,
    ProductNote,
    ProductVariant,
)
_FLAG = "catalog_cache_dirty"


def _changes_visible_data(obj: object) -> bool:
    if isinstance(obj, Vendor):
        # Only status (and name/slug shown on product cards) affect the storefront.
        state = inspect(obj)
        return any(state.attrs[k].history.has_changes() for k in ("status", "name", "slug"))
    if not isinstance(obj, CATALOG_MODELS):
        return False
    if isinstance(obj, ProductVariant):
        state = inspect(obj)
        changed = {
            a.key for a in state.mapper.column_attrs if state.attrs[a.key].history.has_changes()
        }
        if changed and changed <= {"stock_quantity", "updated_at"}:
            hist = state.attrs.stock_quantity.history
            old = hist.deleted[0] if hist.deleted else None
            new = hist.added[0] if hist.added else None
            return old is None or new is None or (old > 0) != (new > 0)
    return True


def _after_flush(session: Session, _ctx: object) -> None:
    if session.info.get(_FLAG):
        return
    for obj in (*session.new, *session.deleted):
        if isinstance(obj, (*CATALOG_MODELS, Vendor)):
            session.info[_FLAG] = True
            return
    for obj in session.dirty:
        if _changes_visible_data(obj):
            session.info[_FLAG] = True
            return


def _after_commit(session: Session) -> None:
    if session.info.pop(_FLAG, False):
        cache.invalidate_soon(CACHE_NS)


def _after_rollback(session: Session) -> None:
    session.info.pop(_FLAG, None)


event.listen(Session, "after_flush", _after_flush)
event.listen(Session, "after_commit", _after_commit)
event.listen(Session, "after_soft_rollback", lambda s, _prev: _after_rollback(s))

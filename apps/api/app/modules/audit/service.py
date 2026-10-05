"""Audit logging.

Routers for admin and vendor actions depend on `audit_context`, which stores an
`AuditContext` in the request's session.info. The `before_flush` listener below
turns every ORM insert/update/delete flushed by that session into an AuditLog row
with a field-level diff — so new admin endpoints are audited without remembering
to call anything, and the log commits or rolls back with the change.

Limits: bulk `update()`/`delete()` statements and plain association-table rows
(e.g. user_roles) bypass the ORM unit of work; record those with `record()`.
"""

import enum
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.modules.audit import repository as repo
from app.modules.audit.models import AuditLog
from app.modules.audit.schemas import AuditContext, AuditLogOut
from app.shared.pagination import Page, PageParams

AUDIT_KEY = "audit_context"
# Tables that are themselves logs/outboxes, or churn on every auth request.
EXCLUDED_TABLES = {"audit_logs", "notifications", "refresh_tokens"}
REDACTED_COLUMNS = {"hashed_password"}


def bind(db: AsyncSession, ctx: AuditContext) -> None:
    db.info[AUDIT_KEY] = ctx


def _jsonable(value: Any) -> Any:
    if value is None or isinstance(value, bool | int | float | str):
        return value
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, Decimal | uuid.UUID):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple | set):
        return [_jsonable(v) for v in value]
    return str(value)


def _diff(obj: object, kind: str) -> dict[str, Any]:
    state = inspect(obj)
    out: dict[str, Any] = {}
    for attr in state.mapper.column_attrs:
        key = attr.key
        if kind == "update":
            # `.history` never loads an unloaded attribute (no SQL inside a flush).
            hist = state.attrs[key].history
            if not hist.has_changes():
                continue
            old = hist.deleted[0] if hist.deleted else None
            new = hist.added[0] if hist.added else None
            out[key] = (
                ["[redacted]", "[redacted]"]
                if key in REDACTED_COLUMNS
                else [_jsonable(old), _jsonable(new)]
            )
        else:
            if key not in state.dict:
                continue
            out[key] = "[redacted]" if key in REDACTED_COLUMNS else _jsonable(state.dict[key])
    return out


def _entity_id(obj: object) -> str | None:
    identity = inspect(obj).identity
    if identity:
        return ",".join(str(v) for v in identity)
    obj_id = inspect(obj).dict.get("id")
    return str(obj_id) if obj_id is not None else None


def _entry(ctx: AuditContext, action: str, entity_type: str, entity_id: str | None, changes):
    return AuditLog(
        id=uuid.uuid4(),
        actor_id=ctx.actor_id,
        actor_email=ctx.actor_email,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes,
        request_method=ctx.method,
        request_path=ctx.path[:300],
        request_id=ctx.request_id,
        ip_address=ctx.ip,
        created_at=datetime.now(UTC),
    )


def _merge(entry: AuditLog, kind: str, changes: dict[str, Any]) -> None:
    """Fold a later flush in the same request into the entity's existing entry,
    so one action logs one row however many times the service autoflushed."""
    table = entry.entity_type
    merged = dict(entry.changes)  # new dict, so the JSONB change is detected
    if kind == "delete":
        entry.action = f"{table}.delete"
    elif kind == "create":
        merged.update(changes)
    elif entry.action.endswith(".create"):
        merged.update({k: new for k, (_old, new) in changes.items()})
    else:
        for key, (old, new) in changes.items():
            merged[key] = [merged[key][0], new] if key in merged else [old, new]
    entry.changes = merged


def _before_flush(session: Session, _flush_context: object, _instances: object) -> None:
    ctx: AuditContext | None = session.info.get(AUDIT_KEY)
    if ctx is None:
        return
    dirty = [o for o in session.dirty if session.is_modified(o, include_collections=False)]
    for kind, objs in (
        ("create", list(session.new)),
        ("update", dirty),
        ("delete", list(session.deleted)),
    ):
        for obj in objs:
            table = getattr(obj, "__tablename__", None)
            if table is None or table in EXCLUDED_TABLES:
                continue
            if kind == "create" and "id" in inspect(obj).mapper.columns and obj.id is None:
                # Python-side defaults fire later in the flush; we need the id now.
                obj.id = uuid.uuid4()
            changes = _diff(obj, kind)
            if kind == "update" and not changes:
                continue
            entity_id = _entity_id(obj)
            # Rows whose key the flush assigns (composite PKs built from FKs, e.g.
            # product_notes) have no id yet: key them by object, fill it in below.
            key = (table, entity_id or f"obj:{id(obj)}")
            if key in ctx.entries:
                _merge(ctx.entries[key], kind, changes)
            else:
                entry = _entry(ctx, f"{table}.{kind}", table, entity_id, changes)
                ctx.entries[key] = entry
                session.add(entry)
                if entity_id is None:
                    ctx.unresolved.append((obj, entry))


def _after_flush_postexec(session: Session, _flush_context: object) -> None:
    ctx: AuditContext | None = session.info.get(AUDIT_KEY)
    if ctx is None or not ctx.unresolved:
        return
    # Identity keys are assigned at the very end of a flush (after `after_flush`),
    # so resolve here; commit re-flushes until clean, persisting these updates.
    for obj, entry in ctx.unresolved:
        entry.entity_id = _entity_id(obj)
    ctx.unresolved.clear()


event.listen(Session, "before_flush", _before_flush)
event.listen(Session, "after_flush_postexec", _after_flush_postexec)


def record(
    db: AsyncSession,
    action: str,
    entity_type: str,
    entity_id: object = None,
    changes: dict[str, Any] | None = None,
) -> None:
    """Explicit entry for what the listener can't see (bulk SQL, role grants).
    No-op outside an audited request."""
    ctx: AuditContext | None = db.info.get(AUDIT_KEY)
    if ctx is None:
        return
    entity = str(entity_id) if entity_id is not None else None
    db.add(_entry(ctx, action, entity_type, entity, _jsonable(changes or {})))


async def list_logs(
    db: AsyncSession,
    page: PageParams,
    *,
    actor_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    q: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> Page[AuditLogOut]:
    rows, total = await repo.list_logs(
        db,
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        q=q,
        since=since,
        until=until,
        offset=page.offset,
        limit=page.size,
    )
    return Page(
        items=[AuditLogOut.model_validate(r) for r in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


async def entity_types(db: AsyncSession) -> list[str]:
    return await repo.entity_types(db)

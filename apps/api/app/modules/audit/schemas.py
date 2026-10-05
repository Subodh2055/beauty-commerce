import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


@dataclass(frozen=True)
class AuditContext:
    """Who is acting, attached to the request's DB session by `audit_context`."""

    actor_id: uuid.UUID
    actor_email: str | None
    method: str
    path: str
    request_id: str | None
    ip: str | None
    # (table, entity_id) -> this request's AuditLog row, for merging across flushes.
    entries: dict[tuple[str, str], Any] = field(default_factory=dict, compare=False)
    # (object, AuditLog) pairs whose entity id is only known after the flush.
    unresolved: list[tuple[Any, Any]] = field(default_factory=list, compare=False)


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_email: str | None
    action: str
    entity_type: str
    entity_id: str | None
    changes: dict[str, Any]
    request_method: str | None
    request_path: str | None
    request_id: str | None
    ip_address: str | None = None
    created_at: datetime

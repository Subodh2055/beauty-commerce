import uuid
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditLog


async def list_logs(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    entity_type: str | None,
    entity_id: str | None,
    action: str | None = None,
    q: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    offset: int,
    limit: int,
) -> tuple[list[AuditLog], int]:
    stmt = select(AuditLog)
    if actor_id is not None:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if action:
        # "update" matches every *.update; "products.update" matches exactly.
        stmt = stmt.where(
            AuditLog.action == action if "." in action else AuditLog.action.like(f"%.{action}")
        )
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                AuditLog.actor_email.ilike(pattern),
                AuditLog.entity_id.ilike(pattern),
                AuditLog.request_path.ilike(pattern),
            )
        )
    if since is not None:
        stmt = stmt.where(AuditLog.created_at >= since)
    if until is not None:
        stmt = stmt.where(AuditLog.created_at < until)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(
        stmt.order_by(AuditLog.created_at.desc(), AuditLog.id).offset(offset).limit(limit)
    )
    return list(rows.all()), total


async def entity_types(db: AsyncSession) -> list[str]:
    rows = await db.scalars(select(AuditLog.entity_type).distinct().order_by(AuditLog.entity_type))
    return list(rows.all())

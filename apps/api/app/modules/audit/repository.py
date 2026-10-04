import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditLog


async def list_logs(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    entity_type: str | None,
    entity_id: str | None,
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
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await db.scalars(
        stmt.order_by(AuditLog.created_at.desc(), AuditLog.id).offset(offset).limit(limit)
    )
    return list(rows.all()), total

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit import service
from app.modules.audit.schemas import AuditLogOut
from app.modules.auth.dependencies import require_permission
from app.shared.enums import Permission
from app.shared.pagination import Page, PageParams, page_params

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]
Paging = Annotated[PageParams, Depends(page_params)]


@router.get(
    "",
    response_model=Page[AuditLogOut],
    dependencies=[Depends(require_permission(Permission.AUDIT_READ))],
    summary="Audit log (newest first)",
)
async def list_audit_logs(
    db: DbSession,
    page: Paging,
    actor_id: Annotated[uuid.UUID | None, Query()] = None,
    entity_type: str | None = Query(default=None, max_length=60),
    entity_id: str | None = Query(default=None, max_length=128),
) -> Page[AuditLogOut]:
    return await service.list_logs(
        db, page, actor_id=actor_id, entity_type=entity_type, entity_id=entity_id
    )

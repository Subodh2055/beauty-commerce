from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit import service
from app.modules.audit.schemas import AuditContext
from app.modules.auth.dependencies import CurrentUser, request_meta

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def audit_context(request: Request, user: CurrentUser, db: DbSession) -> None:
    """Router-level dependency for admin/vendor routers: every change the request
    flushes is written to audit_logs. `get_db` is cached per request, so this is
    the same session the endpoint uses."""
    _, ip = request_meta(request)
    service.bind(
        db,
        AuditContext(
            actor_id=user.id,
            actor_email=user.email,
            method=request.method,
            path=request.url.path,
            request_id=getattr(request.state, "request_id", None),
            ip=ip,
        ),
    )


Audited = Depends(audit_context)

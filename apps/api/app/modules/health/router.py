from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import require_permission
from app.modules.health import service, system
from app.modules.health.schemas import HealthResponse, SystemHealth
from app.shared.enums import Permission

router = APIRouter()
admin_router = APIRouter(dependencies=[Audited])  # /super-admin/system

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=HealthResponse, summary="Liveness probe")
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=HealthResponse, summary="Readiness probe")
async def ready(db: DbSession) -> HealthResponse:
    return await service.readiness(db)


@admin_router.get(
    "/health",
    response_model=SystemHealth,
    dependencies=[Depends(require_permission(Permission.SYSTEM_VIEW))],
    summary="Postgres, Redis, Celery, n8n and API latency (super admin)",
)
async def system_health(db: DbSession) -> SystemHealth:
    return await system.system_health(db)

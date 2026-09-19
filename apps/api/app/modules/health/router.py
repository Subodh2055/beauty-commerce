from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.health import service
from app.modules.health.schemas import HealthResponse

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=HealthResponse, summary="Liveness probe")
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=HealthResponse, summary="Readiness probe")
async def ready(db: DbSession) -> HealthResponse:
    return await service.readiness(db)

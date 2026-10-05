from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.analytics import service
from app.modules.analytics.schemas import AdminAnalytics
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import require_permission
from app.shared.enums import Permission

router = APIRouter(dependencies=[Audited])  # /admin/analytics

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "",
    response_model=AdminAnalytics,
    dependencies=[Depends(require_permission(Permission.ANALYTICS_VIEW))],
    summary="Sales over a date range (inclusive) vs the period before it",
)
async def analytics(
    db: DbSession,
    start: Annotated[date, Query(description="First day, YYYY-MM-DD (UTC)")],
    end: Annotated[date, Query(description="Last day, inclusive")],
) -> AdminAnalytics:
    return await service.admin_analytics(db, start, end)

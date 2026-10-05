"""/super-admin/commission — commission rules (super admin only)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import require_permission
from app.modules.commission import service
from app.modules.commission.schemas import CommissionRules, OptionalRateIn, RateIn
from app.shared.enums import Permission

router = APIRouter(dependencies=[Audited])

DbSession = Annotated[AsyncSession, Depends(get_db)]
CanView = [Depends(require_permission(Permission.COMMISSION_VIEW))]
CanEdit = [Depends(require_permission(Permission.COMMISSION_EDIT))]


@router.get("", response_model=CommissionRules, dependencies=CanView)
async def get_rules(db: DbSession) -> CommissionRules:
    return await service.rules(db)


@router.put("/global", response_model=CommissionRules, dependencies=CanEdit)
async def set_global(body: RateIn, db: DbSession) -> CommissionRules:
    return await service.set_global(db, body.rate)


@router.put("/categories/{category_id}", response_model=CommissionRules, dependencies=CanEdit)
async def set_category(
    category_id: uuid.UUID, body: OptionalRateIn, db: DbSession
) -> CommissionRules:
    return await service.set_category(db, category_id, body.rate)


@router.put("/vendors/{vendor_id}", response_model=CommissionRules, dependencies=CanEdit)
async def set_vendor(vendor_id: uuid.UUID, body: OptionalRateIn, db: DbSession) -> CommissionRules:
    return await service.set_vendor(db, vendor_id, body.rate)

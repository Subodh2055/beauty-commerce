import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import require_permission
from app.modules.payouts import service
from app.modules.payouts.schemas import (
    PayoutCreateIn,
    PayoutDetail,
    PayoutOut,
    PayoutPaidIn,
    VendorBalance,
)
from app.modules.users.models import User
from app.shared.enums import Permission
from app.shared.pagination import Page, PageParams, page_params

# Mounted at /admin/payouts. Vendors read their own payouts via /vendor/payouts.
router = APIRouter(dependencies=[Audited])

DbSession = Annotated[AsyncSession, Depends(get_db)]
Paging = Annotated[PageParams, Depends(page_params)]
PayoutsView = Annotated[User, Depends(require_permission(Permission.PAYOUTS_VIEW))]
PayoutsCreate = Annotated[User, Depends(require_permission(Permission.PAYOUTS_CREATE))]
PayoutsEdit = Annotated[User, Depends(require_permission(Permission.PAYOUTS_EDIT))]


@router.get("/balances", response_model=list[VendorBalance], summary="What each vendor is owed")
async def balances(db: DbSession, _: PayoutsView) -> list[VendorBalance]:
    return await service.balances(db)


@router.get("", response_model=Page[PayoutOut])
async def list_payouts(
    db: DbSession,
    _: PayoutsView,
    page: Paging,
    vendor_id: Annotated[uuid.UUID | None, Query()] = None,
    status: str | None = Query(default=None),
) -> Page[PayoutOut]:
    return await service.list_payouts(db, page, vendor_id=vendor_id, status=status)


@router.post(
    "",
    response_model=PayoutDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Bundle a vendor's eligible orders into a payout",
)
async def create_payout(body: PayoutCreateIn, db: DbSession, admin: PayoutsCreate) -> PayoutDetail:
    return await service.generate(db, body.vendor_id, admin.id, body.note)


@router.get("/{payout_id}", response_model=PayoutDetail)
async def get_payout(payout_id: uuid.UUID, db: DbSession, _: PayoutsView) -> PayoutDetail:
    return await service.get_payout(db, payout_id)


@router.post("/{payout_id}/mark-paid", response_model=PayoutDetail)
async def mark_paid(
    payout_id: uuid.UUID, body: PayoutPaidIn, db: DbSession, _: PayoutsEdit
) -> PayoutDetail:
    return await service.mark_paid(db, payout_id, body.reference)


@router.post("/{payout_id}/cancel", response_model=PayoutDetail)
async def cancel_payout(payout_id: uuid.UUID, db: DbSession, _: PayoutsEdit) -> PayoutDetail:
    return await service.cancel(db, payout_id)

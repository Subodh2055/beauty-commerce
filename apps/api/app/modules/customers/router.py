import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.dependencies import Audited
from app.modules.auth.dependencies import require_permission
from app.modules.customers import service
from app.modules.customers.schemas import (
    CustomerDetail,
    CustomerRow,
    CustomerSort,
    CustomerStatusIn,
)
from app.modules.users.models import User
from app.shared.enums import Permission
from app.shared.pagination import Page, PageParams, page_params

router = APIRouter(dependencies=[Audited])  # /admin/customers

DbSession = Annotated[AsyncSession, Depends(get_db)]
Paging = Annotated[PageParams, Depends(page_params)]
CustomersView = Annotated[User, Depends(require_permission(Permission.CUSTOMERS_VIEW))]
CustomersEdit = Annotated[User, Depends(require_permission(Permission.CUSTOMERS_EDIT))]


@router.get("", response_model=Page[CustomerRow])
async def list_customers(
    db: DbSession,
    _: CustomersView,
    page: Paging,
    q: str | None = Query(default=None, max_length=100),
    active: bool | None = Query(default=None),
    sort: CustomerSort = "newest",
) -> Page[CustomerRow]:
    return await service.list_customers(db, page, q, active, sort)


@router.get("/{customer_id}", response_model=CustomerDetail)
async def get_customer(customer_id: uuid.UUID, db: DbSession, _: CustomersView) -> CustomerDetail:
    return await service.get_customer(db, customer_id)


@router.patch(
    "/{customer_id}/status",
    response_model=CustomerDetail,
    summary="Block (signs them out everywhere) or unblock a customer",
)
async def set_status(
    customer_id: uuid.UUID, body: CustomerStatusIn, db: DbSession, staff: CustomersEdit
) -> CustomerDetail:
    return await service.set_status(db, customer_id, body, staff.id)

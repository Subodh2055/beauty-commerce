from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import CurrentUser
from app.modules.payments import service
from app.modules.payments.schemas import (
    CallbackAck,
    PaymentMethodOut,
    StubPaymentIn,
    StubPaymentOut,
    StubPaymentResult,
)

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/methods",
    response_model=list[PaymentMethodOut],
    summary="Checkout payment options and whether each is available",
)
async def payment_methods() -> list[PaymentMethodOut]:
    return service.list_methods()


@router.get(
    "/stub",
    response_model=StubPaymentOut,
    summary="Dev stub gateway: payment awaiting approval (404 unless enabled)",
)
async def stub_payment(
    db: DbSession, user: CurrentUser, ref: Annotated[str, Query(min_length=1, max_length=128)]
) -> StubPaymentOut:
    return await service.get_stub_payment(db, ref, user.id)


@router.post(
    "/stub/complete",
    response_model=StubPaymentResult,
    summary="Dev stub gateway: approve or decline (signed server-side, 404 unless enabled)",
)
async def complete_stub_payment(
    body: StubPaymentIn, db: DbSession, user: CurrentUser
) -> StubPaymentResult:
    return await service.complete_stub_payment(db, body, user.id)


@router.post(
    "/{provider}/callback",
    response_model=CallbackAck,
    summary="Provider payment notification (signature-verified, idempotent)",
)
async def payment_callback(
    provider: str,
    db: DbSession,
    payload: Annotated[dict[str, Any], Body()],
    x_signature: Annotated[str | None, Header()] = None,
) -> CallbackAck:
    # Unauthenticated by design — providers call this. Trust comes from the
    # signature the provider class verifies, never from the caller.
    return await service.handle_callback(db, provider, payload, x_signature)

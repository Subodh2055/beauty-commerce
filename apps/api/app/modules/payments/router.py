from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.payments import service
from app.modules.payments.schemas import CallbackAck

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


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

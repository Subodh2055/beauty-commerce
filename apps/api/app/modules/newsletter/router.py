from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.ratelimit import limit
from app.modules.newsletter import service
from app.modules.newsletter.schemas import NewsletterAck, SubscribeIn, UnsubscribeIn

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.post(
    "/subscriptions",
    response_model=NewsletterAck,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Join the newsletter (idempotent; same reply whether new or not)",
    dependencies=[limit("newsletter", 10, 600)],
)
async def subscribe(body: SubscribeIn, db: DbSession) -> NewsletterAck:
    return await service.subscribe(db, str(body.email), body.source)


@router.post("/unsubscribe", response_model=NewsletterAck, summary="One-click unsubscribe")
async def unsubscribe(body: UnsubscribeIn, db: DbSession) -> NewsletterAck:
    return await service.unsubscribe(db, body.token)

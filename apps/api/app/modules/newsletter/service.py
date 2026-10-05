from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.newsletter import repository as repo
from app.modules.newsletter.schemas import NewsletterAck
from app.shared.enums import SubscriptionStatus

SUBSCRIBED = NewsletterAck(message="You're on the list. Watch your inbox for new arrivals.")


async def subscribe(db: AsyncSession, email: str, source: str) -> NewsletterAck:
    await repo.upsert_subscribed(db, email.strip().lower(), source)
    await db.commit()
    return SUBSCRIBED


async def unsubscribe(db: AsyncSession, token: str) -> NewsletterAck:
    sub = await repo.by_token(db, token)
    if sub is None:
        raise NotFoundError("This unsubscribe link is invalid or has expired")
    if sub.status != SubscriptionStatus.UNSUBSCRIBED:
        sub.status = SubscriptionStatus.UNSUBSCRIBED
        sub.unsubscribed_at = datetime.now(UTC)
        await db.commit()
    return NewsletterAck(message="You've been unsubscribed. Sorry to see you go.")

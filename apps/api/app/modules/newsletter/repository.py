import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.newsletter.models import NewsletterSubscriber
from app.shared.enums import SubscriptionStatus


async def upsert_subscribed(db: AsyncSession, email: str, source: str) -> None:
    """Subscribe, or re-subscribe a past unsubscriber, in one statement."""
    now = datetime.now(UTC)
    stmt = insert(NewsletterSubscriber).values(
        id=uuid.uuid4(),
        email=email,
        status=SubscriptionStatus.SUBSCRIBED,
        source=source,
        unsubscribe_token=secrets.token_urlsafe(32),
        created_at=now,
        updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[NewsletterSubscriber.email],
        set_={
            "status": SubscriptionStatus.SUBSCRIBED,
            "unsubscribed_at": None,
            "updated_at": now,
        },
    )
    await db.execute(stmt)


async def by_token(db: AsyncSession, token: str) -> NewsletterSubscriber | None:
    return await db.scalar(
        select(NewsletterSubscriber).where(NewsletterSubscriber.unsubscribe_token == token)
    )

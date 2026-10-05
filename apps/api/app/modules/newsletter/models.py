from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin
from app.shared.enums import SubscriptionStatus


class NewsletterSubscriber(UUIDMixin, TimestampMixin, Base):
    """One row per email address, ever. Unsubscribing flips the status rather
    than deleting, so a later re-subscribe keeps its history."""

    __tablename__ = "newsletter_subscribers"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default=SubscriptionStatus.SUBSCRIBED, nullable=False
    )
    # Where the sign-up happened (footer, landing, checkout, …).
    source: Mapped[str] = mapped_column(String(40), default="footer", nullable=False)
    # Opaque token for the one-click unsubscribe link in every email.
    unsubscribe_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    unsubscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDMixin


class PaymentEvent(UUIDMixin, Base):
    """Every callback/webhook a provider sends, stored before it is acted on.

    UNIQUE(provider, event_id) is the idempotency guard: a provider retrying the
    same notification inserts nothing new and changes nothing.
    (The `payments` table itself stays with the orders module.)
    """

    __tablename__ = "payment_events"
    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_payment_events_provider_event"),
    )

    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    event_id: Mapped[str] = mapped_column(String(128), nullable=False)
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="SET NULL"), index=True
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)  # e.g. payment.succeeded
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    outcome: Mapped[str] = mapped_column(String(30), nullable=False)  # applied / ignored / ...
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

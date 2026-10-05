import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDMixin
from app.shared.enums import ReturnStatus


class ReturnRequest(UUIDMixin, TimestampMixin, Base):
    """A customer's request to send back some or all of a delivered order.

    REQUESTED → APPROVED → RECEIVED → REFUNDED, or REJECTED at review. The
    refund itself is a `Refund` row so a partial refund (or one without a
    return, e.g. a goodwill gesture) is recorded the same way.
    """

    __tablename__ = "return_requests"

    reference: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default=ReturnStatus.REQUESTED, index=True, nullable=False
    )
    reason: Mapped[str] = mapped_column(String(30), nullable=False)
    details: Mapped[str | None] = mapped_column(Text)
    # [{"order_item_id": "...", "quantity": 1}] — what the customer is sending back.
    items: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    # Value of the returned lines at the price paid; the default refund amount.
    requested_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    decision_note: Mapped[str | None] = mapped_column(String(500))
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    restocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    refunds: Mapped[list["Refund"]] = relationship(
        back_populates="return_request", lazy="selectin", order_by="Refund.created_at"
    )


class Refund(UUIDMixin, Base):
    """Money given back on an order. Recorded by staff after paying it out
    (gateway refunds are not automated yet), so `reference` is the provider or
    bank reference they paid it with."""

    __tablename__ = "refunds"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_refunds_amount_positive"),)

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    return_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("return_requests.id", ondelete="SET NULL"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)  # ORIGINAL | MANUAL
    reference: Mapped[str | None] = mapped_column(String(128))
    note: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )

    return_request: Mapped[ReturnRequest | None] = relationship(back_populates="refunds")

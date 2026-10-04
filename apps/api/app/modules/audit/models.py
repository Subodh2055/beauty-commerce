import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDMixin


class AuditLog(UUIDMixin, Base):
    """Append-only record of a change made through an admin or vendor route.

    Written by the `before_flush` listener in audit/service.py, inside the same
    transaction as the change itself: if the change rolls back, so does its log.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_entity", "entity_type", "entity_id"),)

    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    # Snapshot, so the log stays readable after the user is deleted.
    actor_email: Mapped[str | None] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(80), nullable=False)  # e.g. products.update
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    # Composite keys are comma-joined (e.g. product_id,note_id,position).
    entity_id: Mapped[str | None] = mapped_column(String(128))
    changes: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    request_method: Mapped[str | None] = mapped_column(String(10))
    request_path: Mapped[str | None] = mapped_column(String(300))
    request_id: Mapped[str | None] = mapped_column(String(64))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

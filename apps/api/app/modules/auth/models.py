import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDMixin


class RefreshToken(UUIDMixin, Base):
    """One row per issued refresh token, keyed by the token's `jti`.

    Rotation: on refresh we revoke the presented token and insert a new one.
    A reused (already-revoked) token is treated as compromise → revoke the
    whole family via `revoke_all_for_user`.
    """

    __tablename__ = "refresh_tokens"

    jti: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Every token minted by rotating this one shares `session_id` and keeps the
    # original `session_started_at`, so the absolute cap survives rotation and a
    # single sign-in can be revoked without touching the user's other devices.
    session_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    session_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # When this individual token lapses — i.e. the sliding idle deadline.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip_address: Mapped[str | None] = mapped_column(String(64))

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

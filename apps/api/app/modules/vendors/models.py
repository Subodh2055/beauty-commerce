"""Vendors: one storefront per user. The row doubles as the application —
status moves PENDING → APPROVED | REJECTED, and APPROVED ⇄ SUSPENDED."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDMixin
from app.shared.enums import VendorStatus


class Vendor(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "vendors"
    __table_args__ = (
        CheckConstraint(
            "commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100)",
            name="ck_vendors_commission_rate",
        ),
    )

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(30))
    # Nepal: PAN/VAT registration; required to receive payouts.
    business_registration_no: Mapped[str | None] = mapped_column(String(60))
    tax_id: Mapped[str | None] = mapped_column(String(60))
    payout_details: Mapped[str | None] = mapped_column(Text)  # bank/e-wallet, free text for V1

    status: Mapped[str] = mapped_column(
        String(20), default=VendorStatus.PENDING, index=True, nullable=False
    )
    status_reason: Mapped[str | None] = mapped_column(String(500))  # rejection/suspension note
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # Percent kept by the platform for this vendor; NULL = platform default setting.
    commission_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))

    # Two FKs point at users (owner_id, reviewed_by), so name the one this follows.
    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])  # noqa: F821

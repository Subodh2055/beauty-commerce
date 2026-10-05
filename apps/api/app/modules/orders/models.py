"""Orders: order header, line items (price-snapshotted), status history, payment.

Money and inventory changes happen inside a single transaction in the service.
Line items and the shipping address are snapshots — they must not change when the
underlying product or the user's saved address later changes.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDMixin
from app.shared.enums import OrderStatus, PaymentMethod, PaymentStatus, VendorOrderStatus


class Order(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "orders"

    order_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    # Nullable: deleting a user keeps their orders (FK is SET NULL).
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    status: Mapped[str] = mapped_column(
        String(20), default=OrderStatus.PENDING_PAYMENT, nullable=False
    )

    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    shipping_fee: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    tax_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"), nullable=False)
    discount_total: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="NPR", nullable=False)

    payment_method: Mapped[str] = mapped_column(String(20), nullable=False)
    payment_status: Mapped[str] = mapped_column(
        String(20), default=PaymentStatus.PENDING, nullable=False
    )

    # Shipping address snapshot
    ship_recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    ship_phone: Mapped[str] = mapped_column(String(30), nullable=False)
    ship_line1: Mapped[str] = mapped_column(String(255), nullable=False)
    ship_line2: Mapped[str | None] = mapped_column(String(255))
    ship_city: Mapped[str] = mapped_column(String(100), nullable=False)
    ship_state: Mapped[str | None] = mapped_column(String(100))
    ship_postal_code: Mapped[str | None] = mapped_column(String(20))
    ship_country: Mapped[str] = mapped_column(String(2), default="NP", nullable=False)
    customer_note: Mapped[str | None] = mapped_column(Text)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )
    history: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderStatusHistory.created_at",
        lazy="selectin",
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )
    vendor_orders: Mapped[list["VendorOrder"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )


class VendorOrder(UUIDMixin, TimestampMixin, Base):
    """One seller's share of an order: its lines, fulfilment status and money split."""

    __tablename__ = "vendor_orders"
    __table_args__ = (
        UniqueConstraint(
            "order_id",
            "vendor_id",
            name="uq_vendor_orders_order_vendor",
            postgresql_nulls_not_distinct=True,
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default=VendorOrderStatus.PENDING, index=True, nullable=False
    )
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Snapshot at checkout; NULL for platform-owned lines (nothing to split).
    commission_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    commission_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    vendor_earnings: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    tracking_number: Mapped[str | None] = mapped_column(String(100))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set once the earnings are included in a payout; never paid twice.
    payout_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payouts.id", ondelete="SET NULL"), index=True
    )

    order: Mapped[Order] = relationship(back_populates="vendor_orders")
    vendor: Mapped["Vendor | None"] = relationship(lazy="joined")  # noqa: F821
    items: Mapped[list["OrderItem"]] = relationship(back_populates="vendor_order", lazy="selectin")

    @property
    def seller_name(self) -> str | None:
        return self.vendor.name if self.vendor else None


class OrderItem(UUIDMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    vendor_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendor_orders.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL")
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_variants.id", ondelete="SET NULL")
    )
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    variant_name: Mapped[str] = mapped_column(String(120), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500))
    slug: Mapped[str | None] = mapped_column(String(220))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Snapshot of the commission on this line (None for platform-sold lines).
    commission_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    commission_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    order: Mapped[Order] = relationship(back_populates="items")
    vendor_order: Mapped[VendorOrder | None] = relationship(back_populates="items")


class OrderStatusHistory(UUIDMixin, Base):
    __tablename__ = "order_status_history"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    order: Mapped[Order] = relationship(back_populates="history")


class Payment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "payments"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=PaymentStatus.PENDING, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="NPR", nullable=False)
    # Provider reference (gateway transaction id / COD marker). Idempotency key for callbacks.
    provider_ref: Mapped[str | None] = mapped_column(String(128), index=True)

    order: Mapped[Order] = relationship(back_populates="payments")


# Convenience: which statuses are still cancellable by the customer.
CANCELLABLE = {OrderStatus.PENDING_PAYMENT, OrderStatus.PROCESSING}
METHOD_VALUES = {m.value for m in PaymentMethod}

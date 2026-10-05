"""vendor_orders: split each order per seller; order_items.vendor_order_id

Existing orders predate vendors, so each becomes one platform sub-order
(vendor_id NULL, no commission) holding all its lines, with a status mapped
from the order's. payout_id's FK is added with the payouts table (0021).

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-10-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a9b0c1d2e3f4"
down_revision: str | None = "f8a9b0c1d2e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vendor_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vendor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("vendors.id", ondelete="RESTRICT"),
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("commission_rate", sa.Numeric(5, 2)),
        sa.Column("commission_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("vendor_earnings", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("tracking_number", sa.String(100)),
        sa.Column("shipped_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("payout_id", postgresql.UUID(as_uuid=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "order_id",
            "vendor_id",
            name="uq_vendor_orders_order_vendor",
            postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index("ix_vendor_orders_order_id", "vendor_orders", ["order_id"])
    op.create_index("ix_vendor_orders_vendor_id", "vendor_orders", ["vendor_id"])
    op.create_index("ix_vendor_orders_status", "vendor_orders", ["status"])
    op.create_index("ix_vendor_orders_payout_id", "vendor_orders", ["payout_id"])

    op.add_column(
        "order_items",
        sa.Column(
            "vendor_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "vendor_orders.id", ondelete="CASCADE", name="fk_order_items_vendor_order_id"
            ),
        ),
    )
    op.create_index("ix_order_items_vendor_order_id", "order_items", ["vendor_order_id"])

    op.execute(
        """
        INSERT INTO vendor_orders
            (id, order_id, vendor_id, status, subtotal, created_at, updated_at)
        SELECT gen_random_uuid(), o.id, NULL,
               CASE o.status
                   WHEN 'PENDING_PAYMENT' THEN 'PENDING'
                   WHEN 'PAID' THEN 'PROCESSING'
                   WHEN 'PROCESSING' THEN 'PROCESSING'
                   WHEN 'SHIPPED' THEN 'SHIPPED'
                   WHEN 'DELIVERED' THEN 'DELIVERED'
                   WHEN 'REFUNDED' THEN 'REFUNDED'
                   ELSE 'CANCELLED'
               END,
               o.subtotal, o.created_at, o.updated_at
        FROM orders o
        """
    )
    op.execute(
        """
        UPDATE order_items i SET vendor_order_id = vo.id
        FROM vendor_orders vo WHERE vo.order_id = i.order_id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_order_items_vendor_order_id", table_name="order_items")
    op.drop_constraint("fk_order_items_vendor_order_id", "order_items", type_="foreignkey")
    op.drop_column("order_items", "vendor_order_id")
    op.drop_table("vendor_orders")

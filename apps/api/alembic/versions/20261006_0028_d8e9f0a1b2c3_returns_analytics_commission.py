"""returns + refunds, analytics_daily rollup, per-category and per-line commission

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-10-06

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: str | None = "c7d8e9f0a1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "return_requests",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("reference", sa.String(20), nullable=False, unique=True),
        sa.Column("order_id", UUID, sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(20), nullable=False, server_default="REQUESTED"),
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column("details", sa.Text()),
        sa.Column("items", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("requested_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("decision_note", sa.String(500)),
        sa.Column("decided_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("received_at", sa.DateTime(timezone=True)),
        sa.Column("restocked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_return_requests_order_id", "return_requests", ["order_id"])
    op.create_index("ix_return_requests_user_id", "return_requests", ["user_id"])
    op.create_index("ix_return_requests_status", "return_requests", ["status"])

    op.create_table(
        "refunds",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("order_id", UUID, sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("return_id", UUID, sa.ForeignKey("return_requests.id", ondelete="SET NULL")),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(128)),
        sa.Column("note", sa.String(500)),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_refunds_amount_positive"),
    )
    op.create_index("ix_refunds_order_id", "refunds", ["order_id"])
    op.create_index("ix_refunds_return_id", "refunds", ["return_id"])
    op.create_index("ix_refunds_created_at", "refunds", ["created_at"])

    op.create_table(
        "analytics_daily",
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("orders_count", sa.Integer(), nullable=False),
        sa.Column("revenue", sa.Numeric(14, 2), nullable=False),
        sa.Column("units", sa.Integer(), nullable=False),
        sa.Column("new_customers", sa.Integer(), nullable=False),
        sa.Column("refunds", sa.Numeric(14, 2), nullable=False),
        sa.Column("by_status", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.add_column("categories", sa.Column("commission_rate", sa.Numeric(5, 2)))
    op.create_check_constraint(
        "ck_categories_commission_rate",
        "categories",
        "commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100)",
    )
    op.add_column("order_items", sa.Column("commission_rate", sa.Numeric(5, 2)))
    op.add_column("order_items", sa.Column("commission_amount", sa.Numeric(12, 2)))
    # Existing lines take their sub-order's snapshot, so per-line figures add up.
    op.execute(
        "UPDATE order_items oi SET commission_rate = vo.commission_rate, "
        "commission_amount = ROUND(oi.line_total * vo.commission_rate / 100, 2) "
        "FROM vendor_orders vo WHERE oi.vendor_order_id = vo.id "
        "AND vo.commission_rate IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("order_items", "commission_amount")
    op.drop_column("order_items", "commission_rate")
    op.drop_constraint("ck_categories_commission_rate", "categories", type_="check")
    op.drop_column("categories", "commission_rate")
    op.drop_table("analytics_daily")
    op.drop_table("refunds")
    op.drop_table("return_requests")

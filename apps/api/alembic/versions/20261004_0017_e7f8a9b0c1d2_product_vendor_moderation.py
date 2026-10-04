"""products: vendor ownership + moderation workflow

REVIEW is renamed PENDING and REJECTED is added; PUBLISHED remains the
approved/live state. Existing products stay platform-owned (vendor_id NULL).
Downgrade maps PENDING back to REVIEW and REJECTED to DRAFT.

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-10-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "d6e7f8a9b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "vendor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("vendors.id", ondelete="RESTRICT", name="fk_products_vendor_id"),
        ),
    )
    op.create_index("ix_products_vendor_id", "products", ["vendor_id"])
    op.add_column("products", sa.Column("submitted_at", sa.DateTime(timezone=True)))
    op.add_column("products", sa.Column("reviewed_at", sa.DateTime(timezone=True)))
    op.add_column(
        "products",
        sa.Column(
            "reviewed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_products_reviewed_by"),
        ),
    )
    op.add_column("products", sa.Column("rejection_reason", sa.String(500)))

    op.execute("UPDATE products SET status = 'PENDING' WHERE status = 'REVIEW'")
    op.create_check_constraint(
        "ck_products_status",
        "products",
        "status IN ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_products_status", "products", type_="check")
    op.execute("UPDATE products SET status = 'REVIEW' WHERE status = 'PENDING'")
    op.execute("UPDATE products SET status = 'DRAFT' WHERE status = 'REJECTED'")
    op.drop_column("products", "rejection_reason")
    op.drop_constraint("fk_products_reviewed_by", "products", type_="foreignkey")
    op.drop_column("products", "reviewed_by")
    op.drop_column("products", "reviewed_at")
    op.drop_column("products", "submitted_at")
    op.drop_index("ix_products_vendor_id", table_name="products")
    op.drop_constraint("fk_products_vendor_id", "products", type_="foreignkey")
    op.drop_column("products", "vendor_id")

"""product_variants.size_ml, backfilled from options/name ("50 ml", "100ML")

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-10-04

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d6e7f8a9b0c1"
down_revision: str | None = "c5d6e7f8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ML = r"'([0-9]+(\.[0-9]+)?)\s*ml\y'"


def upgrade() -> None:
    op.add_column("product_variants", sa.Column("size_ml", sa.Numeric(6, 1)))
    op.execute(
        f"""
        UPDATE product_variants
        SET size_ml = (regexp_match(
            lower(coalesce(options->>'volume', options->>'size', name)), {ML}
        ))[1]::numeric
        WHERE lower(coalesce(options->>'volume', options->>'size', name)) ~ {ML}
        """
    )
    op.create_check_constraint(
        "ck_product_variants_size_ml", "product_variants", "size_ml IS NULL OR size_ml > 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_product_variants_size_ml", "product_variants", type_="check")
    op.drop_column("product_variants", "size_ml")

"""products: meta_title / meta_description (search snippet overrides)

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-10-05

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b6c7d8e9f0a1"
down_revision: str | None = "a5b6c7d8e9f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("products", sa.Column("meta_title", sa.String(length=70), nullable=True))
    op.add_column("products", sa.Column("meta_description", sa.String(length=170), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "meta_description")
    op.drop_column("products", "meta_title")

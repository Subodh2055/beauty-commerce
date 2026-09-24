"""session timeouts: group refresh tokens into sessions

Adds `session_id` and `session_started_at` to refresh_tokens so rotation can
carry a session's original sign-in time forward, which is what the absolute
timeout is measured from. The idle timeout needs no schema — it is the refresh
token's own `expires_at`.

Existing rows are backfilled as single-token sessions (session_id = jti,
session_started_at = created_at). They keep working until their next rotation,
at which point the new rules apply.

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-09-24

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: str | None = "c9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("refresh_tokens", sa.Column("session_id", sa.String(length=32), nullable=True))
    op.add_column(
        "refresh_tokens",
        sa.Column("session_started_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute(
        "UPDATE refresh_tokens "
        "SET session_id = jti, session_started_at = created_at "
        "WHERE session_id IS NULL"
    )

    op.alter_column("refresh_tokens", "session_id", nullable=False)
    op.alter_column("refresh_tokens", "session_started_at", nullable=False)
    op.create_index("ix_refresh_tokens_session_id", "refresh_tokens", ["session_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_session_id", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "session_started_at")
    op.drop_column("refresh_tokens", "session_id")

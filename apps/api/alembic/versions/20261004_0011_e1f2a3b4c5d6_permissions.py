"""permissions + role_permissions, seeded with the default grants

SUPER_ADMIN also bypasses checks in code, so it keeps access to permissions
added later; its rows here are for visibility. The grant table is a snapshot —
later migrations add new permissions/grants, they never import app code.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-10-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | None = "d0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PERMISSIONS = {
    "dashboard.read": "View admin dashboard and notifications",
    "catalog.manage": "Create and edit brands, categories, fragrance taxonomy and products",
    "catalog.moderate": "Approve or reject vendor products",
    "orders.manage": "View orders and change their status",
    "inventory.manage": "Adjust stock",
    "coupons.manage": "Create and edit coupons",
    "vendors.manage": "Review vendor applications, suspend vendors, set commission",
    "payouts.manage": "Generate and settle vendor payouts",
    "cms.manage": "Edit homepage banners",
    "support.manage": "Handle support tickets",
    "settings.manage": "Change platform settings",
    "audit.read": "Read the audit log",
    "media.upload": "Upload images",
    "vendor.portal": "Use the vendor portal",
}

ALL_ADMIN = [p for p in PERMISSIONS if p != "vendor.portal"]
GRANTS = {
    "SUPER_ADMIN": ALL_ADMIN,
    "ADMIN": [p for p in ALL_ADMIN if p != "settings.manage"],
    "STAFF": [
        "dashboard.read",
        "orders.manage",
        "inventory.manage",
        "support.manage",
        "media.upload",
    ],
    "VENDOR": ["vendor.portal", "media.upload"],
}


def _q(s: str) -> str:
    return s.replace("'", "''")


def upgrade() -> None:
    op.create_table(
        "permissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(60), nullable=False, unique=True),
        sa.Column("description", sa.String(255)),
    )
    op.create_table(
        "role_permissions",
        sa.Column(
            "role_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("roles.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "permission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("permissions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    values = ", ".join(f"(gen_random_uuid(), '{c}', '{_q(d)}')" for c, d in PERMISSIONS.items())
    op.execute(f"INSERT INTO permissions (id, code, description) VALUES {values}")
    for role, codes in GRANTS.items():
        in_list = ", ".join(f"'{c}'" for c in codes)
        op.execute(
            "INSERT INTO role_permissions (role_id, permission_id) "
            f"SELECT r.id, p.id FROM roles r, permissions p "
            f"WHERE r.name = '{role}' AND p.code IN ({in_list})"
        )


def downgrade() -> None:
    op.drop_table("role_permissions")
    op.drop_table("permissions")

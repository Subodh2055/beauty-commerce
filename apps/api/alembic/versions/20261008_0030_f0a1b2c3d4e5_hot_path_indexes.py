"""indexes for hot filters and unindexed foreign keys

Found by the repo audit (pg_catalog query for single-column FKs without an
index, plus the filters the admin lists and analytics use):

- orders (status, created_at)   admin order list by status, newest first
- orders (created_at)           analytics date ranges, dashboard counts
- order_items (product_id)      bestselling sort, analytics, recommendations
- order_items (variant_id)      deleting a variant (FK check) and stock joins
- user_roles (role_id)          "who holds this role", staff/customer splits
- role_permissions (permission_id)
- coupon_usage (order_id)       FK checks when orders are deleted
- notifications (created_at)    admin notification feed
- users (created_at)            new-customer analytics

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
Create Date: 2026-10-08

"""

from collections.abc import Sequence

from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: str | None = "e9f0a1b2c3d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEXES = [
    ("ix_orders_status_created_at", "orders", ["status", "created_at"]),
    ("ix_orders_created_at", "orders", ["created_at"]),
    ("ix_order_items_product_id", "order_items", ["product_id"]),
    ("ix_order_items_variant_id", "order_items", ["variant_id"]),
    ("ix_user_roles_role_id", "user_roles", ["role_id"]),
    ("ix_role_permissions_permission_id", "role_permissions", ["permission_id"]),
    ("ix_coupon_usage_order_id", "coupon_usage", ["order_id"]),
    ("ix_notifications_created_at", "notifications", ["created_at"]),
    ("ix_users_created_at", "users", ["created_at"]),
]


def upgrade() -> None:
    for name, table, cols in INDEXES:
        op.create_index(name, table, cols, if_not_exists=True)


def downgrade() -> None:
    for name, table, _ in reversed(INDEXES):
        op.drop_index(name, table_name=table, if_exists=True)

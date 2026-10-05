"""split coarse *.manage permissions into module.view/create/edit/delete

The super-admin permissions matrix needs one code per (module, action). Built-in
roles get explicit new grants; any custom role keeps equivalent access through
OLD_TO_NEW. Codes for admin users, roles, commission, settings, audit and system
health are super-admin-only (the app refuses to grant them to other roles), so
ADMIN loses audit.read here: the audit log moved to /super-admin.

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-10-06

"""

from collections.abc import Sequence

from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: str | None = "b6c7d8e9f0a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW = {
    "dashboard.view": "View the admin dashboard and notifications",
    "analytics.view": "View sales analytics",
    "orders.view": "View orders",
    "orders.edit": "Change order status, mark orders paid",
    "returns.view": "View return requests and refunds",
    "returns.edit": "Approve, reject and refund returns",
    "customers.view": "View customer accounts",
    "customers.edit": "Block and unblock customers",
    "coupons.view": "View coupons",
    "coupons.create": "Create coupons",
    "coupons.edit": "Edit and deactivate coupons",
    "coupons.delete": "Delete unused coupons",
    "products.view": "View all products",
    "products.create": "Create products",
    "products.edit": "Edit products",
    "products.delete": "Delete products",
    "moderation.view": "View the product moderation queue",
    "moderation.edit": "Approve or reject vendor products",
    "taxonomy.view": "View brands, categories and fragrance taxonomy",
    "taxonomy.create": "Create brands, categories, families and notes",
    "taxonomy.edit": "Edit brands, categories, families and notes",
    "taxonomy.delete": "Delete brands, categories, families and notes",
    "inventory.view": "View stock",
    "inventory.edit": "Adjust stock",
    "vendors.view": "View vendors and applications",
    "vendors.edit": "Approve, reject, suspend and reinstate vendors",
    "payouts.view": "View vendor balances and payouts",
    "payouts.create": "Generate payouts",
    "payouts.edit": "Settle or cancel payouts",
    "cms.view": "View banners",
    "cms.create": "Create banners",
    "cms.edit": "Edit banners",
    "cms.delete": "Delete banners",
    "support.view": "Read support tickets",
    "support.edit": "Reply to and update support tickets",
    "admins.view": "View admin users (super admin only)",
    "admins.edit": "Grant and revoke admin roles (super admin only)",
    "roles.view": "View roles and permissions (super admin only)",
    "roles.create": "Create roles (super admin only)",
    "roles.edit": "Edit role permissions (super admin only)",
    "roles.delete": "Delete roles (super admin only)",
    "commission.view": "View commission rules (super admin only)",
    "commission.edit": "Change commission rules (super admin only)",
    "settings.view": "View platform settings (super admin only)",
    "settings.edit": "Change platform settings (super admin only)",
    "audit.view": "Read the audit log (super admin only)",
    "system.view": "View system health (super admin only)",
}
SUPER_MODULES = {"admins", "roles", "commission", "settings", "audit", "system"}
SUPER_ONLY = [c for c in NEW if c.split(".")[0] in SUPER_MODULES]
GRANTABLE = [c for c in NEW if c not in SUPER_ONLY] + ["media.upload"]

GRANTS = {
    "SUPER_ADMIN": GRANTABLE + SUPER_ONLY,
    "ADMIN": GRANTABLE,
    "STAFF": [
        "dashboard.view",
        "orders.view",
        "orders.edit",
        "returns.view",
        "returns.edit",
        "customers.view",
        "inventory.view",
        "inventory.edit",
        "support.view",
        "support.edit",
        "media.upload",
    ],
    "VENDOR": ["vendor.portal", "media.upload"],
}

OLD = {
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
}
OLD_GRANTS = {
    "SUPER_ADMIN": [*OLD, "media.upload"],
    "ADMIN": [c for c in OLD if c != "settings.manage"] + ["media.upload"],
    "STAFF": [
        "dashboard.read",
        "orders.manage",
        "inventory.manage",
        "support.manage",
        "media.upload",
    ],
    "VENDOR": ["vendor.portal", "media.upload"],
}
# For custom roles only (built-in roles are re-seeded from GRANTS).
OLD_TO_NEW = {
    "dashboard.read": ["dashboard.view", "analytics.view"],
    "catalog.manage": [
        *(f"products.{a}" for a in ("view", "create", "edit", "delete")),
        *(f"taxonomy.{a}" for a in ("view", "create", "edit", "delete")),
    ],
    "catalog.moderate": ["moderation.view", "moderation.edit"],
    "orders.manage": [
        "orders.view",
        "orders.edit",
        "returns.view",
        "returns.edit",
        "customers.view",
    ],
    "inventory.manage": ["inventory.view", "inventory.edit"],
    "coupons.manage": [f"coupons.{a}" for a in ("view", "create", "edit", "delete")],
    "vendors.manage": ["vendors.view", "vendors.edit"],
    "payouts.manage": ["payouts.view", "payouts.create", "payouts.edit"],
    "cms.manage": [f"cms.{a}" for a in ("view", "create", "edit", "delete")],
    "support.manage": ["support.view", "support.edit"],
}
BUILT_IN = list(GRANTS)


def _q(s: str) -> str:
    return s.replace("'", "''")


def _in(codes) -> str:
    return ", ".join(f"'{c}'" for c in codes)


def _insert_codes(codes: dict[str, str]) -> None:
    values = ", ".join(f"(gen_random_uuid(), '{c}', '{_q(d)}')" for c, d in codes.items())
    op.execute(
        f"INSERT INTO permissions (id, code, description) VALUES {values} "
        "ON CONFLICT (code) DO NOTHING"
    )


def _grant(role: str, codes) -> None:
    op.execute(
        "INSERT INTO role_permissions (role_id, permission_id) "
        "SELECT r.id, p.id FROM roles r, permissions p "
        f"WHERE r.name = '{role}' AND p.code IN ({_in(codes)}) ON CONFLICT DO NOTHING"
    )


def _reseed(grants: dict[str, list[str]]) -> None:
    op.execute(
        "DELETE FROM role_permissions WHERE role_id IN "
        f"(SELECT id FROM roles WHERE name IN ({_in(BUILT_IN)}))"
    )
    for role, codes in grants.items():
        _grant(role, codes)


def upgrade() -> None:
    _insert_codes(NEW)
    for old, new in OLD_TO_NEW.items():
        op.execute(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT rp.role_id, pn.id FROM role_permissions rp "
            "JOIN permissions po ON po.id = rp.permission_id "
            f"JOIN roles r ON r.id = rp.role_id AND r.name NOT IN ({_in(BUILT_IN)}) "
            f"CROSS JOIN permissions pn WHERE po.code = '{old}' AND pn.code IN ({_in(new)}) "
            "ON CONFLICT DO NOTHING"
        )
    _reseed(GRANTS)
    op.execute(f"DELETE FROM permissions WHERE code IN ({_in(OLD)})")


def downgrade() -> None:
    _insert_codes(OLD)
    _reseed(OLD_GRANTS)
    op.execute(f"DELETE FROM permissions WHERE code IN ({_in(NEW)})")

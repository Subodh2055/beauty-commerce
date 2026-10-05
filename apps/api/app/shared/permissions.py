"""The permission matrix: which module offers which action, and what is reserved
for SUPER_ADMIN.

`MATRIX` drives the super-admin permissions UI (module rows x view/create/edit/
delete columns; a missing action is simply not offered for that module).
`SUPER_ADMIN_ONLY` codes can never be granted to another role: the role editor
refuses them and `User.has_permission` ignores such rows if they ever appear.
"""

from dataclasses import dataclass

from app.shared.enums import Permission as P

ACTIONS = ("view", "create", "edit", "delete")


@dataclass(frozen=True)
class MatrixModule:
    key: str
    label: str
    group: str
    actions: dict[str, P]
    super_admin_only: bool = False


MATRIX: tuple[MatrixModule, ...] = (
    MatrixModule("dashboard", "Dashboard & notifications", "Overview", {"view": P.DASHBOARD_VIEW}),
    MatrixModule("analytics", "Analytics", "Overview", {"view": P.ANALYTICS_VIEW}),
    MatrixModule("orders", "Orders", "Sales", {"view": P.ORDERS_VIEW, "edit": P.ORDERS_EDIT}),
    MatrixModule(
        "returns", "Returns & refunds", "Sales", {"view": P.RETURNS_VIEW, "edit": P.RETURNS_EDIT}
    ),
    MatrixModule(
        "customers",
        "Customers",
        "Sales",
        {"view": P.CUSTOMERS_VIEW, "edit": P.CUSTOMERS_EDIT},
    ),
    MatrixModule(
        "coupons",
        "Coupons",
        "Sales",
        {
            "view": P.COUPONS_VIEW,
            "create": P.COUPONS_CREATE,
            "edit": P.COUPONS_EDIT,
            "delete": P.COUPONS_DELETE,
        },
    ),
    MatrixModule(
        "products",
        "Products",
        "Catalog",
        {
            "view": P.PRODUCTS_VIEW,
            "create": P.PRODUCTS_CREATE,
            "edit": P.PRODUCTS_EDIT,
            "delete": P.PRODUCTS_DELETE,
        },
    ),
    MatrixModule(
        "moderation",
        "Product moderation",
        "Catalog",
        {"view": P.MODERATION_VIEW, "edit": P.MODERATION_EDIT},
    ),
    MatrixModule(
        "taxonomy",
        "Brands, categories & fragrance",
        "Catalog",
        {
            "view": P.TAXONOMY_VIEW,
            "create": P.TAXONOMY_CREATE,
            "edit": P.TAXONOMY_EDIT,
            "delete": P.TAXONOMY_DELETE,
        },
    ),
    MatrixModule(
        "inventory", "Inventory", "Catalog", {"view": P.INVENTORY_VIEW, "edit": P.INVENTORY_EDIT}
    ),
    MatrixModule("media", "Media uploads", "Catalog", {"create": P.MEDIA_UPLOAD}),
    MatrixModule(
        "vendors", "Vendors", "Marketplace", {"view": P.VENDORS_VIEW, "edit": P.VENDORS_EDIT}
    ),
    MatrixModule(
        "payouts",
        "Payouts",
        "Marketplace",
        {"view": P.PAYOUTS_VIEW, "create": P.PAYOUTS_CREATE, "edit": P.PAYOUTS_EDIT},
    ),
    MatrixModule(
        "cms",
        "Banners",
        "Content",
        {
            "view": P.CMS_VIEW,
            "create": P.CMS_CREATE,
            "edit": P.CMS_EDIT,
            "delete": P.CMS_DELETE,
        },
    ),
    MatrixModule(
        "support", "Support inbox", "Content", {"view": P.SUPPORT_VIEW, "edit": P.SUPPORT_EDIT}
    ),
    # --- super admin only -------------------------------------------------------
    MatrixModule(
        "admins",
        "Admin users",
        "Platform",
        {"view": P.ADMINS_VIEW, "edit": P.ADMINS_EDIT},
        super_admin_only=True,
    ),
    MatrixModule(
        "roles",
        "Roles & permissions",
        "Platform",
        {
            "view": P.ROLES_VIEW,
            "create": P.ROLES_CREATE,
            "edit": P.ROLES_EDIT,
            "delete": P.ROLES_DELETE,
        },
        super_admin_only=True,
    ),
    MatrixModule(
        "commission",
        "Commission rules",
        "Platform",
        {"view": P.COMMISSION_VIEW, "edit": P.COMMISSION_EDIT},
        super_admin_only=True,
    ),
    MatrixModule(
        "settings",
        "Platform settings",
        "Platform",
        {"view": P.SETTINGS_VIEW, "edit": P.SETTINGS_EDIT},
        super_admin_only=True,
    ),
    MatrixModule("audit", "Audit log", "Platform", {"view": P.AUDIT_VIEW}, super_admin_only=True),
    MatrixModule(
        "system", "System health", "Platform", {"view": P.SYSTEM_VIEW}, super_admin_only=True
    ),
)

SUPER_ADMIN_ONLY: frozenset[str] = frozenset(
    code.value for m in MATRIX if m.super_admin_only for code in m.actions.values()
)
# Everything a role editor can tick (vendor.portal belongs to the VENDOR role only).
GRANTABLE: frozenset[str] = frozenset(
    code.value for m in MATRIX if not m.super_admin_only for code in m.actions.values()
)
# Roles that ship with the platform: their names can't change and they can't be deleted.
# SUPER_ADMIN's grants are implicit (all); CUSTOMER and VENDOR aren't staff roles.
BUILT_IN_ROLES = frozenset({"CUSTOMER", "STAFF", "VENDOR", "ADMIN", "SUPER_ADMIN"})
LOCKED_ROLES = frozenset({"CUSTOMER", "VENDOR", "SUPER_ADMIN"})

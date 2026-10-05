from enum import StrEnum


class Role(StrEnum):
    CUSTOMER = "CUSTOMER"
    STAFF = "STAFF"
    VENDOR = "VENDOR"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class OrderStatus(StrEnum):
    CART = "CART"
    PENDING_PAYMENT = "PENDING_PAYMENT"
    PAID = "PAID"
    PROCESSING = "PROCESSING"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"
    PAYMENT_FAILED = "PAYMENT_FAILED"


class Permission(StrEnum):
    """Fine-grained grants, `<module>.<action>`, attached to roles via
    `role_permissions`. The matrix layout (module x view/create/edit/delete) and
    which codes are super-admin-only live in `app.shared.permissions`.
    SUPER_ADMIN passes every check regardless of rows."""

    DASHBOARD_VIEW = "dashboard.view"
    ANALYTICS_VIEW = "analytics.view"
    ORDERS_VIEW = "orders.view"
    ORDERS_EDIT = "orders.edit"
    RETURNS_VIEW = "returns.view"
    RETURNS_EDIT = "returns.edit"
    PRODUCTS_VIEW = "products.view"
    PRODUCTS_CREATE = "products.create"
    PRODUCTS_EDIT = "products.edit"
    PRODUCTS_DELETE = "products.delete"
    MODERATION_VIEW = "moderation.view"
    MODERATION_EDIT = "moderation.edit"
    TAXONOMY_VIEW = "taxonomy.view"
    TAXONOMY_CREATE = "taxonomy.create"
    TAXONOMY_EDIT = "taxonomy.edit"
    TAXONOMY_DELETE = "taxonomy.delete"
    INVENTORY_VIEW = "inventory.view"
    INVENTORY_EDIT = "inventory.edit"
    COUPONS_VIEW = "coupons.view"
    COUPONS_CREATE = "coupons.create"
    COUPONS_EDIT = "coupons.edit"
    COUPONS_DELETE = "coupons.delete"
    VENDORS_VIEW = "vendors.view"
    VENDORS_EDIT = "vendors.edit"
    PAYOUTS_VIEW = "payouts.view"
    PAYOUTS_CREATE = "payouts.create"
    PAYOUTS_EDIT = "payouts.edit"
    CUSTOMERS_VIEW = "customers.view"
    CUSTOMERS_EDIT = "customers.edit"
    CMS_VIEW = "cms.view"
    CMS_CREATE = "cms.create"
    CMS_EDIT = "cms.edit"
    CMS_DELETE = "cms.delete"
    SUPPORT_VIEW = "support.view"
    SUPPORT_EDIT = "support.edit"
    MEDIA_UPLOAD = "media.upload"
    VENDOR_PORTAL = "vendor.portal"
    # Super admin only: never granted to another role (see shared/permissions.py).
    ADMINS_VIEW = "admins.view"
    ADMINS_EDIT = "admins.edit"
    ROLES_VIEW = "roles.view"
    ROLES_CREATE = "roles.create"
    ROLES_EDIT = "roles.edit"
    ROLES_DELETE = "roles.delete"
    COMMISSION_VIEW = "commission.view"
    COMMISSION_EDIT = "commission.edit"
    SETTINGS_VIEW = "settings.view"
    SETTINGS_EDIT = "settings.edit"
    AUDIT_VIEW = "audit.view"
    SYSTEM_VIEW = "system.view"


class ProductStatus(StrEnum):
    """DRAFT → PENDING (submitted) → PUBLISHED (approved, live) or REJECTED.
    ARCHIVED takes a product off sale without deleting it."""

    DRAFT = "DRAFT"
    PENDING = "PENDING"
    PUBLISHED = "PUBLISHED"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"


class Gender(StrEnum):
    WOMEN = "WOMEN"
    MEN = "MEN"
    UNISEX = "UNISEX"


class NotePosition(StrEnum):
    TOP = "TOP"
    HEART = "HEART"
    BASE = "BASE"


class VendorStatus(StrEnum):
    PENDING = "PENDING"  # application submitted, awaiting review
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SUSPENDED = "SUSPENDED"


class VendorOrderStatus(StrEnum):
    """Fulfilment state of one vendor's share of an order."""

    PENDING = "PENDING"  # parent order awaiting payment
    PROCESSING = "PROCESSING"  # paid / COD accepted: new, to be packed
    PACKED = "PACKED"  # packed and waiting for the courier
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class ReturnStatus(StrEnum):
    """REQUESTED → APPROVED → RECEIVED → REFUNDED, or REJECTED at review."""

    REQUESTED = "REQUESTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RECEIVED = "RECEIVED"
    REFUNDED = "REFUNDED"


class PayoutStatus(StrEnum):
    PENDING = "PENDING"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class TicketStatus(StrEnum):
    OPEN = "OPEN"
    AWAITING_CUSTOMER = "AWAITING_CUSTOMER"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class TicketPriority(StrEnum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"


class MediaStatus(StrEnum):
    PENDING = "PENDING"
    READY = "READY"
    FAILED = "FAILED"


class SubscriptionStatus(StrEnum):
    SUBSCRIBED = "SUBSCRIBED"
    UNSUBSCRIBED = "UNSUBSCRIBED"


class PaymentMethod(StrEnum):
    COD = "COD"
    ESEWA = "ESEWA"
    KHALTI = "KHALTI"
    STRIPE = "STRIPE"


class PaymentStatus(StrEnum):
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class DiscountType(StrEnum):
    PERCENT = "PERCENT"
    FIXED = "FIXED"


class InventoryReason(StrEnum):
    SALE = "SALE"
    CANCEL = "CANCEL"
    RESTOCK = "RESTOCK"
    ADJUST = "ADJUST"


class NotificationChannel(StrEnum):
    N8N = "N8N"  # dispatched to n8n, which fans out to email/SMS/FCM
    EMAIL = "EMAIL"  # direct SMTP fallback
    LOG = "LOG"  # dev fallback: written to logs only


class NotificationStatus(StrEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"

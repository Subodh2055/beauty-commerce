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
    """Fine-grained grants, attached to roles via `role_permissions`.
    SUPER_ADMIN passes every check regardless of rows."""

    DASHBOARD_READ = "dashboard.read"
    CATALOG_MANAGE = "catalog.manage"
    CATALOG_MODERATE = "catalog.moderate"
    ORDERS_MANAGE = "orders.manage"
    INVENTORY_MANAGE = "inventory.manage"
    COUPONS_MANAGE = "coupons.manage"
    VENDORS_MANAGE = "vendors.manage"
    PAYOUTS_MANAGE = "payouts.manage"
    CMS_MANAGE = "cms.manage"
    SUPPORT_MANAGE = "support.manage"
    SETTINGS_MANAGE = "settings.manage"
    AUDIT_READ = "audit.read"
    MEDIA_UPLOAD = "media.upload"
    VENDOR_PORTAL = "vendor.portal"


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

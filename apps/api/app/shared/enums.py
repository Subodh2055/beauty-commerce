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


class ProductStatus(StrEnum):
    DRAFT = "DRAFT"
    REVIEW = "REVIEW"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


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

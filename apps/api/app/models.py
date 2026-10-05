"""Imports every module's models so Alembic autogenerate sees all tables.

Add `from app.modules.<name>.models import ...` when you add a module.
"""

from app.core.database import Base
from app.modules.audit.models import AuditLog
from app.modules.auth.models import RefreshToken
from app.modules.cart.models import CartItem
from app.modules.catalog.models import (
    Brand,
    Category,
    FragranceFamily,
    FragranceNote,
    Product,
    ProductEmbedding,
    ProductImage,
    ProductNote,
    ProductVariant,
)
from app.modules.cms.models import Banner
from app.modules.coupons.models import Coupon, CouponUsage
from app.modules.inventory.models import InventoryTransaction
from app.modules.media.models import MediaAsset
from app.modules.newsletter.models import NewsletterSubscriber
from app.modules.notifications.models import Notification
from app.modules.orders.models import Order, OrderItem, OrderStatusHistory, Payment, VendorOrder
from app.modules.payments.models import PaymentEvent
from app.modules.payouts.models import Payout
from app.modules.reviews.models import Review
from app.modules.settings.models import PlatformSetting
from app.modules.support.models import SupportTicket, TicketMessage
from app.modules.users.models import Address, Permission, Role, User
from app.modules.vendors.models import Vendor
from app.modules.wishlist.models import WishlistItem

__all__ = [
    "Base",
    "Address",
    "Permission",
    "Role",
    "User",
    "RefreshToken",
    "AuditLog",
    "PlatformSetting",
    "Vendor",
    "Brand",
    "Category",
    "FragranceFamily",
    "FragranceNote",
    "Product",
    "ProductEmbedding",
    "ProductImage",
    "ProductNote",
    "ProductVariant",
    "Order",
    "OrderItem",
    "OrderStatusHistory",
    "Payment",
    "VendorOrder",
    "PaymentEvent",
    "Payout",
    "Banner",
    "SupportTicket",
    "TicketMessage",
    "MediaAsset",
    "NewsletterSubscriber",
    "Review",
    "Coupon",
    "CouponUsage",
    "InventoryTransaction",
    "Notification",
    "WishlistItem",
    "CartItem",
]

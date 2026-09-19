"""Imports every module's models so Alembic autogenerate sees all tables.

Add `from app.modules.<name>.models import ...` when you add a module.
"""

from app.core.database import Base
from app.modules.auth.models import RefreshToken
from app.modules.cart.models import CartItem
from app.modules.catalog.models import Brand, Category, Product, ProductImage, ProductVariant
from app.modules.coupons.models import Coupon, CouponUsage
from app.modules.inventory.models import InventoryTransaction
from app.modules.notifications.models import Notification
from app.modules.orders.models import Order, OrderItem, OrderStatusHistory, Payment
from app.modules.reviews.models import Review
from app.modules.users.models import Address, Role, User
from app.modules.wishlist.models import WishlistItem

__all__ = [
    "Base",
    "Address",
    "Role",
    "User",
    "RefreshToken",
    "Brand",
    "Category",
    "Product",
    "ProductImage",
    "ProductVariant",
    "Order",
    "OrderItem",
    "OrderStatusHistory",
    "Payment",
    "Review",
    "Coupon",
    "CouponUsage",
    "InventoryTransaction",
    "Notification",
    "WishlistItem",
    "CartItem",
]

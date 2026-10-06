"""Aggregates every module's router into the versioned API router.

Add a new module here after creating it under app/modules/<name>/.
Admin routers are mounted under /admin and depend on `audit_context`, so every
change made through them is written to audit_logs (see modules/audit).
"""

from fastapi import APIRouter

from app.modules.access.router import router as access_router
from app.modules.admin.router import router as admin_router
from app.modules.analytics.router import router as analytics_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.cart.router import router as cart_router
from app.modules.catalog.router import (
    brands_router,
    categories_router,
    fragrance_router,
    products_router,
)
from app.modules.cms.router import admin_router as cms_admin_router
from app.modules.cms.router import router as cms_router
from app.modules.commission.router import router as commission_router
from app.modules.coupons.router import router as coupons_router
from app.modules.customers.router import router as customers_router
from app.modules.health.router import admin_router as system_router
from app.modules.health.router import router as health_router
from app.modules.media.router import router as media_router
from app.modules.newsletter.router import router as newsletter_router
from app.modules.orders.router import router as orders_router
from app.modules.payments.router import router as payments_router
from app.modules.payouts.router import router as payouts_admin_router
from app.modules.recommendations.router import router as recommendations_router
from app.modules.returns.router import admin_router as returns_admin_router
from app.modules.returns.router import mine_router as my_returns_router
from app.modules.returns.router import router as returns_router
from app.modules.reviews.router import highlights_router as review_highlights_router
from app.modules.reviews.router import mine_router as my_reviews_router
from app.modules.reviews.router import router as reviews_router
from app.modules.settings.router import admin_router as settings_admin_router
from app.modules.settings.router import public_router as settings_router
from app.modules.support.router import admin_router as support_admin_router
from app.modules.support.router import router as support_router
from app.modules.users.router import router as users_router
from app.modules.vendors.router import admin_router as vendors_admin_router
from app.modules.vendors.router import portal_router as vendor_portal_router
from app.modules.vendors.router import router as vendors_router
from app.modules.wishlist.router import router as wishlist_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="/health", tags=["health"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(products_router, prefix="/products", tags=["catalog"])
# Review routes live under /products/{slug}/reviews.
api_router.include_router(reviews_router, prefix="/products", tags=["reviews"])
api_router.include_router(review_highlights_router, prefix="/reviews", tags=["reviews"])
api_router.include_router(categories_router, prefix="/categories", tags=["catalog"])
api_router.include_router(brands_router, prefix="/brands", tags=["catalog"])
api_router.include_router(fragrance_router, prefix="/fragrance", tags=["catalog"])
api_router.include_router(orders_router, prefix="/orders", tags=["orders"])
api_router.include_router(returns_router, prefix="/orders", tags=["returns"])
api_router.include_router(payments_router, prefix="/payments", tags=["payments"])
api_router.include_router(cart_router, prefix="/users/me/cart", tags=["cart"])
api_router.include_router(wishlist_router, prefix="/users/me/wishlist", tags=["wishlist"])
api_router.include_router(my_reviews_router, prefix="/users/me/reviews", tags=["reviews"])
api_router.include_router(my_returns_router, prefix="/users/me/returns", tags=["returns"])
api_router.include_router(coupons_router, prefix="/coupons", tags=["coupons"])
api_router.include_router(vendors_router, prefix="/vendors", tags=["vendors"])
api_router.include_router(vendor_portal_router, prefix="/vendor", tags=["vendor portal"])
api_router.include_router(cms_router, prefix="/cms", tags=["cms"])
api_router.include_router(support_router, prefix="/support", tags=["support"])
api_router.include_router(settings_router, prefix="/settings", tags=["settings"])
api_router.include_router(media_router, prefix="/media", tags=["media"])
api_router.include_router(newsletter_router, prefix="/newsletter", tags=["newsletter"])
api_router.include_router(
    recommendations_router, prefix="/recommendations", tags=["recommendations"]
)

api_router.include_router(admin_router, prefix="/admin", tags=["admin"])
api_router.include_router(vendors_admin_router, prefix="/admin/vendors", tags=["admin"])
api_router.include_router(payouts_admin_router, prefix="/admin/payouts", tags=["admin"])
api_router.include_router(cms_admin_router, prefix="/admin/banners", tags=["admin"])
api_router.include_router(support_admin_router, prefix="/admin/support", tags=["admin"])
api_router.include_router(analytics_router, prefix="/admin/analytics", tags=["admin"])
api_router.include_router(returns_admin_router, prefix="/admin/returns", tags=["admin"])
api_router.include_router(customers_router, prefix="/admin/customers", tags=["admin"])

# Super admin only: every route needs a code that only SUPER_ADMIN can hold.
api_router.include_router(access_router, prefix="/super-admin", tags=["super admin"])
api_router.include_router(commission_router, prefix="/super-admin/commission", tags=["super admin"])
api_router.include_router(
    settings_admin_router, prefix="/super-admin/settings", tags=["super admin"]
)
api_router.include_router(audit_router, prefix="/super-admin/audit-logs", tags=["super admin"])
api_router.include_router(system_router, prefix="/super-admin/system", tags=["super admin"])

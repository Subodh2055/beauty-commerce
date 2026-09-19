"""Aggregates every module's router into the versioned API router.

Add a new module here after creating it under app/modules/<name>/.
"""

from fastapi import APIRouter

from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.cart.router import router as cart_router
from app.modules.catalog.router import brands_router, categories_router, products_router
from app.modules.coupons.router import router as coupons_router
from app.modules.health.router import router as health_router
from app.modules.orders.router import router as orders_router
from app.modules.reviews.router import router as reviews_router
from app.modules.users.router import router as users_router
from app.modules.wishlist.router import router as wishlist_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="/health", tags=["health"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(products_router, prefix="/products", tags=["catalog"])
# Review routes live under /products/{slug}/reviews.
api_router.include_router(reviews_router, prefix="/products", tags=["reviews"])
api_router.include_router(categories_router, prefix="/categories", tags=["catalog"])
api_router.include_router(brands_router, prefix="/brands", tags=["catalog"])
api_router.include_router(orders_router, prefix="/orders", tags=["orders"])
api_router.include_router(cart_router, prefix="/users/me/cart", tags=["cart"])
api_router.include_router(wishlist_router, prefix="/users/me/wishlist", tags=["wishlist"])
api_router.include_router(coupons_router, prefix="/coupons", tags=["coupons"])
api_router.include_router(admin_router, prefix="/admin", tags=["admin"])

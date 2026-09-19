import uuid
from decimal import Decimal

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import Product
from app.modules.orders.models import Order, OrderItem
from app.modules.reviews.models import Review
from app.shared.enums import OrderStatus


async def get_product_by_slug(db: AsyncSession, slug: str) -> Product | None:
    return await db.scalar(select(Product).where(Product.slug == slug))


async def list_reviews(
    db: AsyncSession, product_id: uuid.UUID, offset: int, limit: int
) -> tuple[list[Review], int]:
    base = select(Review).where(Review.product_id == product_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    stmt = (
        base.order_by(Review.is_verified_purchase.desc(), Review.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.scalars(stmt)).all()
    return list(rows), total


async def get_user_review(
    db: AsyncSession, product_id: uuid.UUID, user_id: uuid.UUID
) -> Review | None:
    return await db.scalar(
        select(Review).where(Review.product_id == product_id, Review.user_id == user_id)
    )


async def star_breakdown(db: AsyncSession, product_id: uuid.UUID) -> dict[str, int]:
    rows = await db.execute(
        select(Review.rating, func.count())
        .where(Review.product_id == product_id)
        .group_by(Review.rating)
    )
    stars = {str(i): 0 for i in range(1, 6)}
    for rating, count in rows:
        stars[str(rating)] = count
    return stars


async def has_purchased(db: AsyncSession, product_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    valid = {
        OrderStatus.PAID,
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
    }
    stmt = select(
        exists().where(
            OrderItem.product_id == product_id,
            OrderItem.order_id == Order.id,
            Order.user_id == user_id,
            Order.status.in_(valid),
        )
    )
    return bool(await db.scalar(stmt))


async def recompute_product_rating(db: AsyncSession, product: Product) -> None:
    row = (
        await db.execute(
            select(func.coalesce(func.avg(Review.rating), 0), func.count()).where(
                Review.product_id == product.id
            )
        )
    ).one()
    product.rating_avg = Decimal(row[0]).quantize(Decimal("0.01"))
    product.rating_count = int(row[1])

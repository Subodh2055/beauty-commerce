"""Review business logic: list with breakdown, upsert own review, delete.

Writing a review recomputes the product's cached rating_avg/rating_count in the
same transaction, so the catalogue and product pages stay consistent.
"""

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.reviews import repository as repo
from app.modules.reviews.models import Review
from app.modules.reviews.schemas import (
    RatingBreakdown,
    ReviewIn,
    ReviewList,
    ReviewOut,
)
from app.modules.users.models import User
from app.shared.pagination import PageParams


async def _get_product_or_404(db: AsyncSession, slug: str):
    product = await repo.get_product_by_slug(db, slug)
    if product is None:
        raise NotFoundError(f"Product '{slug}' not found")
    return product


async def list_reviews(
    db: AsyncSession, slug: str, page: PageParams, user_id: uuid.UUID | None
) -> ReviewList:
    product = await _get_product_or_404(db, slug)
    rows, total = await repo.list_reviews(db, product.id, page.offset, page.size)
    stars = await repo.star_breakdown(db, product.id)

    mine = None
    if user_id is not None:
        own = await repo.get_user_review(db, product.id, user_id)
        mine = ReviewOut.model_validate(own) if own else None

    return ReviewList(
        items=[ReviewOut.model_validate(r) for r in rows],
        total=total,
        page=page.page,
        size=page.size,
        breakdown=RatingBreakdown(
            average=Decimal(product.rating_avg), count=product.rating_count, stars=stars
        ),
        my_review=mine,
    )


async def upsert_review(db: AsyncSession, slug: str, user: User, body: ReviewIn) -> ReviewOut:
    product = await _get_product_or_404(db, slug)
    existing = await repo.get_user_review(db, product.id, user.id)
    verified = await repo.has_purchased(db, product.id, user.id)
    author = user.full_name or user.email.split("@")[0]

    if existing is None:
        review = Review(
            product_id=product.id,
            user_id=user.id,
            rating=body.rating,
            title=body.title,
            body=body.body,
            author_name=author,
            is_verified_purchase=verified,
        )
        db.add(review)
    else:
        existing.rating = body.rating
        existing.title = body.title
        existing.body = body.body
        existing.is_verified_purchase = verified
        review = existing

    await db.flush()
    await repo.recompute_product_rating(db, product)
    await db.commit()
    await db.refresh(review)
    return ReviewOut.model_validate(review)


async def delete_my_review(db: AsyncSession, slug: str, user_id: uuid.UUID) -> None:
    product = await _get_product_or_404(db, slug)
    review = await repo.get_user_review(db, product.id, user_id)
    if review is None:
        raise NotFoundError("You have not reviewed this product")
    await db.delete(review)
    await db.flush()
    await repo.recompute_product_rating(db, product)
    await db.commit()

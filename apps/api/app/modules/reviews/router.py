from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import CurrentUser, OptionalUser
from app.modules.reviews import service
from app.modules.reviews.schemas import FeaturedReview, MyReview, ReviewIn, ReviewList, ReviewOut
from app.shared.pagination import PageParams, page_params

router = APIRouter()  # mounted at /products: /products/{slug}/reviews
highlights_router = APIRouter()  # mounted at /reviews
mine_router = APIRouter()  # mounted at /users/me/reviews

DbSession = Annotated[AsyncSession, Depends(get_db)]
Paging = Annotated[PageParams, Depends(page_params)]


@router.get("/{slug}/reviews", response_model=ReviewList, summary="List product reviews")
async def list_reviews(slug: str, db: DbSession, page: Paging, user: OptionalUser) -> ReviewList:
    return await service.list_reviews(db, slug, page, user.id if user else None)


@router.put(
    "/{slug}/reviews",
    response_model=ReviewOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create or update my review",
)
async def upsert_review(slug: str, body: ReviewIn, db: DbSession, user: CurrentUser) -> ReviewOut:
    return await service.upsert_review(db, slug, user, body)


@router.delete(
    "/{slug}/reviews",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete my review",
)
async def delete_review(slug: str, db: DbSession, user: CurrentUser) -> None:
    await service.delete_my_review(db, slug, user.id)


@highlights_router.get(
    "/featured",
    response_model=list[FeaturedReview],
    summary="Recent 4-5 star reviews with text (storefront testimonials)",
)
async def featured_reviews(
    db: DbSession, limit: Annotated[int, Query(ge=1, le=24)] = 12
) -> list[FeaturedReview]:
    return await service.featured_reviews(db, limit)


@mine_router.get("", response_model=list[MyReview], summary="My reviews")
async def my_reviews(db: DbSession, user: CurrentUser) -> list[MyReview]:
    return await service.my_reviews(db, user.id)

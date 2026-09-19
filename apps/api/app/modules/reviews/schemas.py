import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=150)
    body: str | None = Field(default=None, max_length=4000)


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rating: int
    title: str | None = None
    body: str | None = None
    author_name: str
    is_verified_purchase: bool
    created_at: datetime


class RatingBreakdown(BaseModel):
    average: Decimal
    count: int
    # counts per star, keyed "1".."5"
    stars: dict[str, int]


class ReviewList(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    size: int
    breakdown: RatingBreakdown
    # The requesting user's own review, if any (so the UI can prefill/edit).
    my_review: ReviewOut | None = None

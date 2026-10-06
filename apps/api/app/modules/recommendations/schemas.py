from typing import Literal

from pydantic import BaseModel, Field

from app.modules.catalog.schemas import ProductSummary

Mood = Literal["fresh", "romantic", "cozy", "bold", "clean", "mysterious"]
Occasion = Literal["everyday", "office", "date", "evening", "special"]
Season = Literal["spring", "summer", "autumn", "winter", "all"]


class ScoredProduct(BaseModel):
    product: ProductSummary
    # 0–100. How well this product fits the request; see service docstrings
    # for how each endpoint computes it.
    match: int
    # Short human reasons ("Has bergamot, which you like"), most important first.
    reasons: list[str] = []


class SearchResults(BaseModel):
    query: str
    # semantic: ranked by embedding similarity. keyword: the vector index was
    # unavailable or empty, so a plain name/description match was used instead.
    mode: Literal["semantic", "keyword"]
    results: list[ScoredProduct]


class QuizIn(BaseModel):
    mood: Mood
    occasion: Occasion
    season: Season
    liked_notes: list[str] = Field(default_factory=list, max_length=12)  # note slugs
    disliked_notes: list[str] = Field(default_factory=list, max_length=12)
    gender: Literal["WOMEN", "MEN", "UNISEX"] | None = None
    max_price: float | None = Field(default=None, gt=0)


class QuizResults(BaseModel):
    summary: str  # "Fresh & energising · Work · Summer"
    results: list[ScoredProduct]


class ForYou(BaseModel):
    # history: built from your orders and wishlist. popular: not enough history yet.
    basis: Literal["history", "popular"]
    results: list[ScoredProduct]


class IndexStatus(BaseModel):
    provider: str
    model: str
    products: int
    embedded: int
    stale: int

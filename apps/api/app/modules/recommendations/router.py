"""/recommendations — semantic search, similar scents, personal picks, the quiz.

Public reads apply the storefront visibility rule in the repository; /for-you
reads only the caller's own orders and wishlist."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.ratelimit import limit
from app.modules.auth.dependencies import CurrentUser, require_permission
from app.modules.recommendations import events as _events  # noqa: F401 — re-embed on write
from app.modules.recommendations import service
from app.modules.recommendations.schemas import (
    ForYou,
    IndexStatus,
    QuizIn,
    QuizResults,
    ScoredProduct,
    SearchResults,
)
from app.shared.enums import Permission

router = APIRouter()

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/search",
    response_model=SearchResults,
    summary='Search by meaning ("fresh citrus scent for summer evenings")',
    dependencies=[limit("semantic_search", 60, 60)],
)
async def search(
    db: DbSession,
    q: Annotated[str, Query(min_length=2, max_length=200)],
    limit: Annotated[int, Query(ge=1, le=24)] = 12,
) -> SearchResults:
    return await service.semantic_search(db, q, limit)


@router.get("/similar/{slug}", response_model=list[ScoredProduct], summary="Similar scents")
async def similar(
    db: DbSession, slug: str, limit: Annotated[int, Query(ge=1, le=16)] = 8
) -> list[ScoredProduct]:
    return await service.similar(db, slug, limit)


@router.get(
    "/for-you",
    response_model=ForYou,
    summary="Picks from your orders and wishlist",
    dependencies=[limit("for_you", 60, 60, by="user")],
)
async def for_you(
    db: DbSession, user: CurrentUser, limit: Annotated[int, Query(ge=1, le=24)] = 12
) -> ForYou:
    return await service.for_you(db, user.id, limit)


@router.post(
    "/quiz",
    response_model=QuizResults,
    summary="Find your scent",
    dependencies=[limit("quiz", 20, 60)],
)
async def quiz(body: QuizIn, db: DbSession) -> QuizResults:
    return await service.quiz(db, body)


@router.get(
    "/status",
    response_model=IndexStatus,
    dependencies=[Depends(require_permission(Permission.PRODUCTS_VIEW))],
    summary="How much of the catalog is embedded with the current model",
)
async def status(db: DbSession) -> IndexStatus:
    return await service.index_status(db)

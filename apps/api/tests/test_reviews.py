"""Review schema validation tests (no DB needed)."""

import pytest
from pydantic import ValidationError

from app.modules.reviews.schemas import RatingBreakdown, ReviewIn


def test_rating_must_be_1_to_5() -> None:
    for good in (1, 3, 5):
        assert ReviewIn(rating=good).rating == good
    for bad in (0, 6, 9, -1):
        with pytest.raises(ValidationError):
            ReviewIn(rating=bad)


def test_review_body_length_capped() -> None:
    with pytest.raises(ValidationError):
        ReviewIn(rating=5, body="x" * 4001)


def test_title_and_body_optional() -> None:
    r = ReviewIn(rating=4)
    assert r.title is None and r.body is None


def test_breakdown_shape() -> None:
    from decimal import Decimal

    stars = {"1": 0, "2": 0, "3": 0, "4": 1, "5": 1}
    b = RatingBreakdown(average=Decimal("4.5"), count=2, stars=stars)
    assert b.stars["5"] == 1
    assert b.count == 2

"""Wishlist schema tests (no DB needed)."""

import uuid

import pytest
from pydantic import ValidationError

from app.modules.wishlist.schemas import WishlistAddIn, WishlistMergeIn


def test_add_requires_uuid() -> None:
    WishlistAddIn(product_id=str(uuid.uuid4()))
    with pytest.raises(ValidationError):
        WishlistAddIn(product_id="not-a-uuid")


def test_merge_defaults_to_empty() -> None:
    assert WishlistMergeIn().product_ids == []


def test_merge_caps_list_length() -> None:
    ids = [str(uuid.uuid4()) for _ in range(201)]
    with pytest.raises(ValidationError):
        WishlistMergeIn(product_ids=ids)

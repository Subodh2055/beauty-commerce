"""Cart schema tests (no DB needed)."""

import uuid

import pytest
from pydantic import ValidationError

from app.modules.cart.schemas import CartItemIn, CartMergeIn, CartSetQtyIn


def test_add_quantity_bounds() -> None:
    vid = str(uuid.uuid4())
    assert CartItemIn(variant_id=vid).quantity == 1
    with pytest.raises(ValidationError):
        CartItemIn(variant_id=vid, quantity=0)
    with pytest.raises(ValidationError):
        CartItemIn(variant_id=vid, quantity=100)


def test_set_quantity_allows_zero_for_removal() -> None:
    assert CartSetQtyIn(quantity=0).quantity == 0
    with pytest.raises(ValidationError):
        CartSetQtyIn(quantity=-1)


def test_merge_caps_item_count() -> None:
    items = [{"variant_id": str(uuid.uuid4()), "quantity": 1} for _ in range(101)]
    with pytest.raises(ValidationError):
        CartMergeIn(items=items)

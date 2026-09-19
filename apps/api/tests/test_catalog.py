"""Catalog query-construction tests.

These exercise the SQL the repository builds without needing a live database,
guarding against regressions like casting jsonb to varchar (which Postgres
rejects — only jsonb::text is valid).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.modules.catalog.models import Category, Product
from app.modules.catalog.repository import apply_filters, apply_sort
from app.modules.catalog.schemas import ProductFilters
from app.modules.catalog.service import _build_tree


def _compiled(stmt) -> str:
    return str(stmt.compile(dialect=postgresql.dialect()))


def test_text_search_casts_tags_to_text_not_varchar() -> None:
    stmt = apply_filters(select(Product), ProductFilters(q="oud"), None)
    sql = _compiled(stmt)
    assert "CAST(products.tags AS TEXT)" in sql
    assert "AS VARCHAR" not in sql.replace("VARCHAR(", "")  # tags cast must be TEXT


def test_price_filters_apply() -> None:
    stmt = apply_filters(select(Product), ProductFilters(min_price=100, max_price=500), None)
    sql = _compiled(stmt)
    assert "products.base_price >=" in sql
    assert "products.base_price <=" in sql


def test_in_stock_uses_exists_subquery() -> None:
    stmt = apply_filters(select(Product), ProductFilters(in_stock=True), None)
    assert "EXISTS" in _compiled(stmt).upper()


def test_sort_options_change_order_by() -> None:
    assert "base_price ASC" in _compiled(apply_sort(select(Product), "price_asc"))
    assert "base_price DESC" in _compiled(apply_sort(select(Product), "price_desc"))
    assert "rating_avg DESC" in _compiled(apply_sort(select(Product), "rating"))


def test_build_tree_nests_children_without_touching_orm_relationship() -> None:
    # Build detached ORM rows: reading `.children` here would lazy-load and fail,
    # so _build_tree must only use scalar columns.
    parent_id = uuid.uuid4()
    child_id = uuid.uuid4()
    parent = Category(id=parent_id, name="Perfumes", slug="perfumes", sort_order=0, parent_id=None)
    child = Category(id=child_id, name="Women's", slug="womens", sort_order=0, parent_id=parent_id)

    tree = _build_tree([parent, child])

    assert len(tree) == 1
    assert tree[0].slug == "perfumes"
    assert [c.slug for c in tree[0].children] == ["womens"]

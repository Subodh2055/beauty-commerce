"""Vendor portal additions: analytics, inventory, reviews, bulk product actions,
product search/sort, the packed stage of the order pipeline and SEO fields.
Each report is checked for vendor isolation (B's data never shows up for A)."""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.reviews.models import Review
from app.shared.enums import ProductStatus
from tests.factories import auth, checkout_body, make_product, make_user, make_vendor

pytestmark = pytest.mark.db


async def _sell(api: AsyncClient, db: AsyncSession, product, qty: int) -> dict:
    """A COD checkout: the vendor sub-order starts in PROCESSING (counts as a sale)."""
    buyer = await make_user(db)
    res = await api.post("/api/v1/orders", json=checkout_body((product, qty)), headers=auth(buyer))
    assert res.status_code == 201, res.text
    return res.json()


async def test_analytics_counts_only_my_sales(api: AsyncClient, db) -> None:
    a, owner_a = await make_vendor(db)
    b, _ = await make_vendor(db)
    hit = await make_product(db, vendor=a, name="A Hit", price="2000", stock=50)
    quiet = await make_product(db, vendor=a, name="A Quiet", price="1000", stock=50)
    theirs = await make_product(db, vendor=b, name="B Thing", price="9000", stock=50)
    await _sell(api, db, hit, 3)
    await _sell(api, db, quiet, 1)
    await _sell(api, db, theirs, 5)
    # Low stock: one of A's variants at the threshold, one of B's at zero.
    low = await make_product(db, vendor=a, name="A Nearly Gone", stock=2)
    await make_product(db, vendor=b, name="B Gone", stock=0)

    res = await api.get("/api/v1/vendor/analytics", params={"days": 7}, headers=auth(owner_a))
    assert res.status_code == 200, res.text
    data = res.json()
    assert len(data["series"]) == 7  # zero-filled
    assert data["totals"]["orders"] == 2
    assert data["totals"]["units"] == 4
    assert Decimal(data["totals"]["revenue"]) == Decimal("7000")
    assert Decimal(data["totals"]["avg_order_value"]) == Decimal("3500")
    assert data["previous"]["orders"] == 0
    assert [p["name"] for p in data["top_products"]] == ["A Hit", "A Quiet"]
    low_names = {item["product_name"] for item in data["low_stock"]}
    assert low.name in low_names and "B Gone" not in low_names

    bad = await api.get("/api/v1/vendor/analytics", params={"days": 1}, headers=auth(owner_a))
    assert bad.status_code == 422


async def test_cancelled_sales_are_not_reported(api: AsyncClient, db) -> None:
    a, owner_a = await make_vendor(db)
    p = await make_product(db, vendor=a, stock=20)
    buyer = await make_user(db)
    out = await api.post("/api/v1/orders", json=checkout_body((p, 2)), headers=auth(buyer))
    order_id = out.json()["order"]["id"]
    cancel = await api.post(f"/api/v1/orders/{order_id}/cancel", headers=auth(buyer))
    assert cancel.status_code == 200

    data = (await api.get("/api/v1/vendor/analytics", headers=auth(owner_a))).json()
    assert data["totals"]["orders"] == 0 and data["top_products"] == []


async def test_inventory_is_scoped_searchable_and_flags_low(api: AsyncClient, db) -> None:
    a, owner_a = await make_vendor(db)
    b, _ = await make_vendor(db)
    await make_product(db, vendor=a, name="Amber Veil", stock=40)
    await make_product(db, vendor=a, name="Rose Water", stock=3)
    await make_product(db, vendor=b, name="Amber Theirs", stock=1)

    rows = (await api.get("/api/v1/vendor/inventory", headers=auth(owner_a))).json()
    names = [r["product_name"] for r in rows["items"]]
    assert rows["total"] == 2 and "Amber Theirs" not in names
    assert names[0] == "Rose Water" and rows["items"][0]["low"] is True  # lowest stock first

    found = (
        await api.get("/api/v1/vendor/inventory", params={"q": "amber"}, headers=auth(owner_a))
    ).json()
    assert [r["product_name"] for r in found["items"]] == ["Amber Veil"]
    low = (
        await api.get("/api/v1/vendor/inventory", params={"low_only": True}, headers=auth(owner_a))
    ).json()
    assert [r["product_name"] for r in low["items"]] == ["Rose Water"]


async def test_reviews_of_my_products_only(api: AsyncClient, db) -> None:
    a, owner_a = await make_vendor(db)
    b, _ = await make_vendor(db)
    mine = await make_product(db, vendor=a, name="Mine")
    theirs = await make_product(db, vendor=b, name="Theirs")
    for product, rating in ((mine, 5), (mine, 3), (theirs, 1)):
        user = await make_user(db)
        db.add(
            Review(
                product_id=product.id,
                user_id=user.id,
                rating=rating,
                body="Lovely",
                author_name="Asha Shrestha",
            )
        )
    await db.flush()

    data = (await api.get("/api/v1/vendor/reviews", headers=auth(owner_a))).json()
    assert data["total"] == 2 and data["count"] == 2
    assert Decimal(data["average"]) == Decimal("4.00")
    assert data["stars"]["5"] == 1 and data["stars"]["1"] == 0
    assert {r["product"]["name"] for r in data["items"]} == {"Mine"}
    assert data["items"][0]["author"] == "Asha S."

    five = (
        await api.get("/api/v1/vendor/reviews", params={"rating": 5}, headers=auth(owner_a))
    ).json()
    assert [r["rating"] for r in five["items"]] == [5]


async def test_bulk_actions_report_per_product_and_skip_foreign(api: AsyncClient, db) -> None:
    a, owner_a = await make_vendor(db)
    b, _ = await make_vendor(db)
    draft = await make_product(db, vendor=a, status=ProductStatus.DRAFT)
    live = await make_product(db, vendor=a, status=ProductStatus.PUBLISHED)
    foreign = await make_product(db, vendor=b, status=ProductStatus.DRAFT)

    res = await api.post(
        "/api/v1/vendor/products/bulk",
        json={"action": "submit", "product_ids": [str(draft.id), str(live.id), str(foreign.id)]},
        headers=auth(owner_a),
    )
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["done"] == [str(draft.id)]
    reasons = {f["id"]: f["reason"] for f in out["failed"]}
    assert reasons[str(foreign.id)] == "Product not found"  # never confirms it exists
    assert str(live.id) in reasons
    await db.refresh(draft)
    await db.refresh(foreign)
    assert draft.status == ProductStatus.PENDING
    assert foreign.status == ProductStatus.DRAFT  # untouched

    archived = await api.post(
        "/api/v1/vendor/products/bulk",
        json={"action": "archive", "product_ids": [str(live.id)]},
        headers=auth(owner_a),
    )
    assert archived.json()["done"] == [str(live.id)]

    deleted = await api.post(
        "/api/v1/vendor/products/bulk",
        json={"action": "delete", "product_ids": [str(foreign.id)]},
        headers=auth(owner_a),
    )
    assert deleted.json()["done"] == []
    assert await db.get(type(foreign), foreign.id) is not None

    empty = await api.post(
        "/api/v1/vendor/products/bulk",
        json={"action": "submit", "product_ids": []},
        headers=auth(owner_a),
    )
    assert empty.status_code == 422


async def test_suspended_vendor_cannot_bulk_edit(api: AsyncClient, db) -> None:
    v, owner = await make_vendor(db, status="SUSPENDED")
    p = await make_product(db, vendor=v, status=ProductStatus.DRAFT)
    res = await api.post(
        "/api/v1/vendor/products/bulk",
        json={"action": "submit", "product_ids": [str(p.id)]},
        headers=auth(owner),
    )
    assert res.status_code == 403
    # ...but can still read reports.
    assert (await api.get("/api/v1/vendor/analytics", headers=auth(owner))).status_code == 200


async def test_product_list_search_and_sort(api: AsyncClient, db) -> None:
    a, owner_a = await make_vendor(db)
    await make_product(db, vendor=a, name="Cedar Mist", price="3000", stock=9)
    await make_product(db, vendor=a, name="Amber Glow", price="1000", stock=1)
    await make_product(db, vendor=a, name="Basil Leaf", price="2000", stock=30)

    def names(res):
        return [p["name"] for p in res.json()["items"]]

    by_price = await api.get(
        "/api/v1/vendor/products", params={"sort": "price_desc"}, headers=auth(owner_a)
    )
    assert names(by_price) == ["Cedar Mist", "Basil Leaf", "Amber Glow"]
    by_stock = await api.get(
        "/api/v1/vendor/products", params={"sort": "stock_asc"}, headers=auth(owner_a)
    )
    assert names(by_stock)[0] == "Amber Glow"
    assert by_stock.json()["items"][0]["variant_count"] == 1
    found = await api.get("/api/v1/vendor/products", params={"q": "basil"}, headers=auth(owner_a))
    assert names(found) == ["Basil Leaf"]
    bad = await api.get("/api/v1/vendor/products", params={"sort": "nope"}, headers=auth(owner_a))
    assert bad.status_code == 422


async def test_order_pipeline_includes_packed(api: AsyncClient, db) -> None:
    a, owner_a = await make_vendor(db)
    p = await make_product(db, vendor=a, stock=10)
    await _sell(api, db, p, 1)
    # Deliberately NOT preloading the order into the test session: the endpoint must
    # load the sibling sub-orders itself (a lazy load in async code is a 500).
    db.expunge_all()
    orders = (await api.get("/api/v1/vendor/orders", headers=auth(owner_a))).json()["items"]
    vo_id = orders[0]["id"]
    assert orders[0]["status"] == "PROCESSING"

    url = f"/api/v1/vendor/orders/{vo_id}/status"
    packed = await api.patch(url, json={"status": "PACKED"}, headers=auth(owner_a))
    assert packed.status_code == 200 and packed.json()["status"] == "PACKED"
    summary = (await api.get("/api/v1/vendor/summary", headers=auth(owner_a))).json()
    assert summary["orders_to_ship"] == 1  # packed still needs shipping

    shipped = await api.patch(
        url, json={"status": "SHIPPED", "tracking_number": "NP-123"}, headers=auth(owner_a)
    )
    assert shipped.json()["status"] == "SHIPPED" and shipped.json()["tracking_number"] == "NP-123"
    delivered = await api.patch(url, json={"status": "DELIVERED"}, headers=auth(owner_a))
    assert delivered.json()["status"] == "DELIVERED"
    # No going backwards through the pipeline.
    back = await api.patch(url, json={"status": "PACKED"}, headers=auth(owner_a))
    assert back.status_code == 422


async def test_seo_fields_round_trip(api: AsyncClient, db) -> None:
    a, owner_a = await make_vendor(db)
    body = {
        "sku": f"SEO-{uuid.uuid4().hex[:6]}",
        "name": "Seo Scent",
        "product_type": "perfume",
        "base_price": "1500",
        "meta_title": "  Seo Scent EDP 50 ml  ",
        "meta_description": "A bright citrus scent.",
        "variants": [{"name": "50 ml", "price": "1500", "stock_quantity": 5}],
    }
    res = await api.post("/api/v1/vendor/products", json=body, headers=auth(owner_a))
    assert res.status_code == 201, res.text
    assert res.json()["meta_title"] == "Seo Scent EDP 50 ml"
    too_long = await api.post(
        "/api/v1/vendor/products",
        json={**body, "sku": "SEO-LONG", "meta_title": "x" * 71},
        headers=auth(owner_a),
    )
    assert too_long.status_code == 422


async def test_portal_reports_need_a_vendor(api: AsyncClient, db) -> None:
    shopper = await make_user(db)
    for path in ("/api/v1/vendor/analytics", "/api/v1/vendor/inventory", "/api/v1/vendor/reviews"):
        assert (await api.get(path, headers=auth(shopper))).status_code == 403
        assert (await api.get(path)).status_code == 401

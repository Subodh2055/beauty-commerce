"""APIs behind the shop, product page, checkout and account upgrades: rating filter
and note/rating facets, similar scents, payment methods + the dev stub pay page,
profile update and "my reviews"."""

from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.modules.reviews.models import Review
from tests.factories import (
    auth,
    checkout_body,
    make_family,
    make_note,
    make_product,
    make_user,
)

pytestmark = pytest.mark.db


async def _rated(db, name: str, avg: str, count: int):
    p = await make_product(db, name=name)
    p.rating_avg, p.rating_count = Decimal(avg), count
    await db.flush()
    return p


async def test_min_rating_filter_and_rating_facet(api: AsyncClient, db) -> None:
    await _rated(db, "Loved Scent", "4.60", 12)
    await _rated(db, "Fine Scent", "3.40", 5)
    await _rated(db, "Unrated Scent", "0", 0)

    res = await api.get("/api/v1/products", params={"min_rating": 4, "size": 100})
    names = {p["name"] for p in res.json()["items"]}
    assert "Loved Scent" in names and not names & {"Fine Scent", "Unrated Scent"}

    facets = (await api.get("/api/v1/products/facets", params={"q": "Scent"})).json()
    ratings = {r["slug"]: r["count"] for r in facets["ratings"]}
    assert ratings["4"] >= 1 and ratings["3"] >= ratings["4"] + 1

    bad = await api.get("/api/v1/products", params={"min_rating": 6})
    assert bad.status_code == 422


async def test_notes_facet_counts_products(api: AsyncClient, db) -> None:
    vetiver, iris = await make_note(db, "Vetiver"), await make_note(db, "Iris")
    await make_product(db, name="Facet A", notes=[(vetiver, "BASE"), (iris, "HEART")])
    await make_product(db, name="Facet B", notes=[(vetiver, "TOP")])

    facets = (await api.get("/api/v1/products/facets", params={"q": "Facet"})).json()
    notes = {n["slug"]: n["count"] for n in facets["notes"]}
    assert notes[vetiver.slug] == 2 and notes[iris.slug] == 1
    assert facets["notes"][0]["slug"] == vetiver.slug  # busiest note first


async def test_similar_scents_ranked_by_shared_notes(api: AsyncClient, db) -> None:
    woody = await make_family(db, "Woody Similar")
    cedar = await make_note(db, "Cedar")
    amber = await make_note(db, "Amber")
    lemon = await make_note(db, "Lemon")
    base = await make_product(
        db, name="Base", family=woody, notes=[(cedar, "BASE"), (amber, "BASE"), (lemon, "TOP")]
    )
    close = await make_product(db, name="Close", notes=[(cedar, "BASE"), (amber, "HEART")])
    loose = await make_product(db, name="Loose", notes=[(lemon, "TOP")])
    family_only = await make_product(db, name="Family Only", family=woody)
    stranger = await make_product(db, name="Stranger")

    res = await api.get(f"/api/v1/products/{base.slug}/similar")
    assert res.status_code == 200
    slugs = [p["slug"] for p in res.json()]
    assert slugs.index(close.slug) < slugs.index(family_only.slug) < slugs.index(loose.slug)
    assert base.slug not in slugs and stranger.slug not in slugs

    assert (await api.get("/api/v1/products/no-such-thing/similar")).status_code == 404


async def test_payment_methods_follow_configuration(api: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "payment_stub_enabled", False)
    methods = {m["method"]: m for m in (await api.get("/api/v1/payments/methods")).json()}
    assert methods["COD"]["available"] and not methods["COD"]["online"]
    assert not methods["ESEWA"]["available"] and methods["ESEWA"]["online"]

    monkeypatch.setattr(settings, "payment_stub_enabled", True)
    methods = {m["method"]: m for m in (await api.get("/api/v1/payments/methods")).json()}
    assert all(m["available"] for m in methods.values())


async def test_stub_pay_page_flow(api: AsyncClient, db, monkeypatch) -> None:
    monkeypatch.setattr(settings, "payment_stub_enabled", True)
    p = await make_product(db, price="2400", stock=5)
    buyer, other = await make_user(db), await make_user(db)
    out = (
        await api.post(
            "/api/v1/orders", json=checkout_body((p, 1), method="ESEWA"), headers=auth(buyer)
        )
    ).json()
    ref = out["payment_redirect_url"].split("ref=")[1]

    # Only the order's owner can see or approve it.
    assert (
        await api.get("/api/v1/payments/stub", params={"ref": ref}, headers=auth(other))
    ).status_code == 404
    shown = await api.get("/api/v1/payments/stub", params={"ref": ref}, headers=auth(buyer))
    assert shown.status_code == 200
    assert shown.json()["order_number"] == out["order"]["order_number"]
    assert shown.json()["status"] == "PENDING"

    denied = await api.post(
        "/api/v1/payments/stub/complete", json={"provider_ref": ref}, headers=auth(other)
    )
    assert denied.status_code == 404

    done = await api.post(
        "/api/v1/payments/stub/complete", json={"provider_ref": ref}, headers=auth(buyer)
    )
    assert done.json() == {"order_id": out["order"]["id"], "outcome": "applied"}
    order = (await api.get(f"/api/v1/orders/{out['order']['id']}", headers=auth(buyer))).json()
    assert (order["status"], order["payment_status"]) == ("PROCESSING", "PAID")

    # A second click doesn't pay twice.
    again = await api.post(
        "/api/v1/payments/stub/complete", json={"provider_ref": ref}, headers=auth(buyer)
    )
    assert again.json()["outcome"] == "already_settled"


async def test_stub_pay_is_404_when_disabled(api: AsyncClient, db, monkeypatch) -> None:
    monkeypatch.setattr(settings, "payment_stub_enabled", False)
    user = await make_user(db)
    res = await api.post(
        "/api/v1/payments/stub/complete", json={"provider_ref": "STUB-x"}, headers=auth(user)
    )
    assert res.status_code == 404


async def test_update_profile(api: AsyncClient, db) -> None:
    user = await make_user(db)
    res = await api.patch(
        "/api/v1/users/me",
        json={"full_name": "  Mira Gurung ", "phone": "9800000000"},
        headers=auth(user),
    )
    assert res.status_code == 200
    assert res.json()["full_name"] == "Mira Gurung" and res.json()["phone"] == "9800000000"
    me = (await api.get("/api/v1/auth/me", headers=auth(user))).json()
    assert me["full_name"] == "Mira Gurung" and me["phone"] == "9800000000"

    assert (
        await api.patch("/api/v1/users/me", json={"full_name": ""}, headers=auth(user))
    ).status_code == 422
    assert (await api.patch("/api/v1/users/me", json={"full_name": "X"})).status_code == 401


async def test_my_reviews_lists_only_mine(api: AsyncClient, db) -> None:
    me, someone = await make_user(db), await make_user(db)
    mine = await make_product(db, name="Reviewed By Me")
    theirs = await make_product(db, name="Reviewed By Them")
    db.add_all(
        [
            Review(product_id=mine.id, user_id=me.id, rating=4, body="Good", author_name="Me"),
            Review(product_id=theirs.id, user_id=someone.id, rating=2, author_name="Them"),
        ]
    )
    await db.flush()

    res = await api.get("/api/v1/users/me/reviews", headers=auth(me))
    assert res.status_code == 200
    items = res.json()
    assert [r["product"]["slug"] for r in items] == [mine.slug]
    assert items[0]["rating"] == 4 and items[0]["product"]["name"] == "Reviewed By Me"
    assert (await api.get("/api/v1/users/me/reviews")).status_code == 401

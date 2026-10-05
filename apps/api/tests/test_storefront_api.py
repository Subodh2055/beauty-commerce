"""APIs behind the landing page: bestselling sort, featured reviews, newsletter."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.modules.newsletter.models import NewsletterSubscriber
from app.modules.reviews.models import Review
from app.modules.reviews.service import short_author
from app.shared.enums import ProductStatus
from tests.factories import auth, checkout_body, make_product, make_user

pytestmark = pytest.mark.db


async def test_bestselling_ranks_by_units_sold(api: AsyncClient, db) -> None:
    quiet = await make_product(db, name="Quiet One", stock=50)
    hit = await make_product(db, name="Big Hit", stock=50)
    buyer = await make_user(db)
    # COD orders count as sales straight away (PROCESSING).
    for qty in (3, 2):
        res = await api.post("/api/v1/orders", json=checkout_body((hit, qty)), headers=auth(buyer))
        assert res.status_code == 201
    res = await api.post("/api/v1/orders", json=checkout_body((quiet, 1)), headers=auth(buyer))
    assert res.status_code == 201

    names = [
        p["name"]
        for p in (
            await api.get("/api/v1/products", params={"sort": "bestselling", "size": 100})
        ).json()["items"]
    ]
    assert names.index("Big Hit") < names.index("Quiet One")


async def test_cancelled_orders_are_not_sales(api: AsyncClient, db) -> None:
    a = await make_product(db, name="Cancelled Hit", stock=50)
    b = await make_product(db, name="Small Real Seller", stock=50)
    buyer = await make_user(db)
    big = (await api.post("/api/v1/orders", json=checkout_body((a, 9)), headers=auth(buyer))).json()
    await api.post(f"/api/v1/orders/{big['order']['id']}/cancel", headers=auth(buyer))
    await api.post("/api/v1/orders", json=checkout_body((b, 1)), headers=auth(buyer))

    names = [
        p["name"]
        for p in (
            await api.get("/api/v1/products", params={"sort": "bestselling", "size": 100})
        ).json()["items"]
    ]
    assert names.index("Small Real Seller") < names.index("Cancelled Hit")


async def _review(db, product, rating, body, name="Asha Shrestha"):
    user = await make_user(db)
    db.add(
        Review(
            product_id=product.id,
            user_id=user.id,
            rating=rating,
            title="t",
            body=body,
            author_name=name,
        )
    )
    await db.flush()


async def test_featured_reviews_are_real_good_and_live(api: AsyncClient, db) -> None:
    live = await make_product(db, name="Live Scent")
    hidden = await make_product(db, name="Draft Scent", status=ProductStatus.DRAFT)
    long_text = "Lovely, long-lasting and exactly as described. Would buy again happily."
    await _review(db, live, 5, long_text)
    await _review(db, live, 2, long_text)  # too low
    await _review(db, live, 5, "Nice.")  # too short to be a testimonial
    await _review(db, hidden, 5, long_text)  # product not live

    res = await api.get("/api/v1/reviews/featured")
    assert res.status_code == 200
    items = [r for r in res.json() if r["product"]["slug"] in (live.slug, hidden.slug)]
    assert len(items) == 1
    assert items[0]["rating"] == 5 and items[0]["product"]["name"] == "Live Scent"
    assert items[0]["author"] == "Asha S."  # surname reduced to an initial


def test_short_author() -> None:
    assert short_author("Asha Shrestha") == "Asha S."
    assert short_author("Madonna") == "Madonna"
    assert short_author("  ") == "Verified customer"


async def test_newsletter_subscribe_is_idempotent_and_private(api: AsyncClient, db) -> None:
    first = await api.post("/api/v1/newsletter/subscriptions", json={"email": "Fan@Example.com"})
    again = await api.post(
        "/api/v1/newsletter/subscriptions", json={"email": "fan@example.com", "source": "landing"}
    )
    assert first.status_code == again.status_code == 202
    # Same reply either way: no way to probe who is already subscribed.
    assert first.json() == again.json()

    rows = (
        await db.scalars(
            select(NewsletterSubscriber).where(NewsletterSubscriber.email == "fan@example.com")
        )
    ).all()
    assert len(rows) == 1 and rows[0].status == "SUBSCRIBED"

    bad = await api.post("/api/v1/newsletter/subscriptions", json={"email": "not-an-email"})
    assert bad.status_code == 422


async def test_unsubscribe_and_resubscribe(api: AsyncClient, db) -> None:
    await api.post("/api/v1/newsletter/subscriptions", json={"email": "leaver@example.com"})
    sub = await db.scalar(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == "leaver@example.com")
    )
    out = await api.post("/api/v1/newsletter/unsubscribe", json={"token": sub.unsubscribe_token})
    assert out.status_code == 200
    await db.refresh(sub)
    assert sub.status == "UNSUBSCRIBED" and sub.unsubscribed_at is not None

    await api.post("/api/v1/newsletter/subscriptions", json={"email": "leaver@example.com"})
    await db.refresh(sub)
    assert sub.status == "SUBSCRIBED" and sub.unsubscribed_at is None

    nope = await api.post("/api/v1/newsletter/unsubscribe", json={"token": "x" * 32})
    assert nope.status_code == 404

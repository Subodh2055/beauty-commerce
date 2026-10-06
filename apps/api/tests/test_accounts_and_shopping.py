"""Gaps the coverage report showed: the full auth lifecycle, cart, wishlist,
addresses, reviews and coupon validation — all over HTTP against Postgres."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.core.security import create_purpose_token
from app.modules.auth.service import _password_fingerprint
from app.modules.coupons.models import Coupon
from app.modules.users.models import User
from tests.factories import auth, make_product, make_user

pytestmark = pytest.mark.db

A = "/api/v1/auth"
PASSWORD = "Sup3r-secret-pass!"


async def _register(api: AsyncClient, email: str = "ann@example.com") -> dict:
    res = await api.post(
        f"{A}/register", json={"email": email, "password": PASSWORD, "full_name": "Ann"}
    )
    assert res.status_code == 201, res.text
    return res.json()


def _bearer(body: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {body['tokens']['access_token']}"}


# --- auth ------------------------------------------------------------------------------


async def test_register_login_me_and_duplicate(api: AsyncClient, db) -> None:
    body = await _register(api, "Ann.Lee@Example.com")
    assert body["user"]["email"] == "ann.lee@example.com" and "CUSTOMER" in body["user"]["roles"]
    me = await api.get(f"{A}/me", headers=_bearer(body))
    assert me.status_code == 200 and me.json()["email"] == "ann.lee@example.com"
    dup = await api.post(
        f"{A}/register", json={"email": "ann.lee@example.com", "password": PASSWORD}
    )
    assert dup.status_code == 409
    bad = await api.post(
        f"{A}/login", json={"email": "ann.lee@example.com", "password": "wrong-pass"}
    )
    unknown = await api.post(f"{A}/login", json={"email": "nobody@example.com", "password": "x"})
    # Same status and message whether or not the account exists.
    assert bad.status_code == unknown.status_code == 401
    assert bad.json()["error"]["message"] == unknown.json()["error"]["message"]
    ok = await api.post(f"{A}/login", json={"email": "ann.lee@example.com", "password": PASSWORD})
    assert ok.status_code == 200


async def test_refresh_rotates_and_reuse_revokes_the_family(api: AsyncClient, db) -> None:
    body = await _register(api)
    first = body["tokens"]["refresh_token"]
    res = await api.post(f"{A}/refresh", json={"refresh_token": first})
    assert res.status_code == 200
    second = res.json()["refresh_token"]
    assert second != first
    # Replaying the rotated-out token looks like theft: everything is revoked.
    assert (await api.post(f"{A}/refresh", json={"refresh_token": first})).status_code == 401
    assert (await api.post(f"{A}/refresh", json={"refresh_token": second})).status_code == 401


async def test_logout_revokes_the_refresh_token(api: AsyncClient, db) -> None:
    body = await _register(api)
    token = body["tokens"]["refresh_token"]
    assert (await api.post(f"{A}/logout", json={"refresh_token": token})).status_code == 200
    assert (await api.post(f"{A}/refresh", json={"refresh_token": token})).status_code == 401


async def test_password_reset_link_works_once(api: AsyncClient, db) -> None:
    body = await _register(api)
    user = await db.get(User, body["user"]["id"])
    token = create_purpose_token(
        str(user.id), "password_reset", extra={"pwf": _password_fingerprint(user.hashed_password)}
    )
    res = await api.post(
        f"{A}/password/reset-confirm", json={"token": token, "new_password": "brand-new-pass-1"}
    )
    assert res.status_code == 200, res.text
    # Old sessions are gone, the new password works, the link is spent.
    assert (
        await api.post(f"{A}/refresh", json={"refresh_token": body["tokens"]["refresh_token"]})
    ).status_code == 401
    login = await api.post(f"{A}/login", json={"email": user.email, "password": "brand-new-pass-1"})
    assert login.status_code == 200
    again = await api.post(
        f"{A}/password/reset-confirm", json={"token": token, "new_password": "another-pass-22"}
    )
    assert again.status_code == 401
    # Unknown emails get the same answer as known ones.
    a = await api.post(f"{A}/password/reset-request", json={"email": user.email})
    b = await api.post(f"{A}/password/reset-request", json={"email": "ghost@example.com"})
    assert a.status_code == b.status_code == 200 and a.json() == b.json()


async def test_change_password_and_verify_email(api: AsyncClient, db) -> None:
    body = await _register(api)
    h = _bearer(body)
    wrong = await api.post(
        f"{A}/password/change",
        json={"current_password": "nope", "new_password": "next-pass-123"},
        headers=h,
    )
    assert wrong.status_code == 401
    ok = await api.post(
        f"{A}/password/change",
        json={"current_password": PASSWORD, "new_password": "next-pass-123"},
        headers=h,
    )
    assert ok.status_code == 200
    token = create_purpose_token(body["user"]["id"], "verify_email")
    assert (await api.post(f"{A}/verify-email", json={"token": token})).status_code == 200
    user = await db.get(User, body["user"]["id"])
    await db.refresh(user)
    assert user.is_email_verified
    # A token for another purpose is refused.
    wrong_kind = create_purpose_token(body["user"]["id"], "password_reset")
    assert (await api.post(f"{A}/verify-email", json={"token": wrong_kind})).status_code == 401


# --- cart + wishlist ---------------------------------------------------------------------


async def test_cart_add_merge_set_and_clear(api: AsyncClient, db) -> None:
    user = await make_user(db)
    h = auth(user)
    a = await make_product(db, price="1000.00", stock=3)
    b = await make_product(db, price="500.00", stock=10)
    va, vb = str(a.variants[0].id), str(b.variants[0].id)

    res = await api.post("/api/v1/users/me/cart", json={"variant_id": va, "quantity": 2}, headers=h)
    assert res.status_code == 200 and res.json()["count"] == 2
    merged = await api.post(
        "/api/v1/users/me/cart/merge",
        json={"items": [{"variant_id": va, "quantity": 5}, {"variant_id": vb, "quantity": 1}]},
        headers=h,
    )
    cart = merged.json()
    lines = {line["variant_id"]: line for line in cart["items"]}
    assert lines[va]["quantity"] == 3  # capped at stock
    assert Decimal(cart["subtotal"]) == Decimal("3500.00")
    res = await api.patch(f"/api/v1/users/me/cart/{vb}", json={"quantity": 0}, headers=h)
    assert [line["variant_id"] for line in res.json()["items"]] == [va]
    res = await api.delete("/api/v1/users/me/cart", headers=h)
    assert res.json()["items"] == []
    # Another user's cart is their own.
    other = await make_user(db)
    assert (await api.get("/api/v1/users/me/cart", headers=auth(other))).json()["items"] == []


async def test_wishlist_add_merge_remove(api: AsyncClient, db) -> None:
    user = await make_user(db)
    h = auth(user)
    a, b = await make_product(db), await make_product(db)
    res = await api.post("/api/v1/users/me/wishlist", json={"product_id": str(a.id)}, headers=h)
    assert [p["id"] for p in res.json()] == [str(a.id)]
    res = await api.post(
        "/api/v1/users/me/wishlist/merge", json={"product_ids": [str(a.id), str(b.id)]}, headers=h
    )
    assert {p["id"] for p in res.json()} == {str(a.id), str(b.id)}
    res = await api.delete(f"/api/v1/users/me/wishlist/{a.id}", headers=h)
    assert [p["id"] for p in res.json()] == [str(b.id)]


# --- addresses + reviews + coupons --------------------------------------------------------


async def test_address_book_default_and_isolation(api: AsyncClient, db) -> None:
    user = await make_user(db)
    h = auth(user)
    base = {"recipient_name": "Ann", "phone": "9800000000", "line1": "Thamel", "city": "Kathmandu"}
    home = (
        await api.post("/api/v1/users/me/addresses", json={**base, "label": "Home"}, headers=h)
    ).json()
    work = (
        await api.post("/api/v1/users/me/addresses", json={**base, "label": "Work"}, headers=h)
    ).json()
    assert home["is_default"] and not work["is_default"]
    res = await api.post(f"/api/v1/users/me/addresses/{work['id']}/default", headers=h)
    assert res.json()["is_default"]
    listed = (await api.get("/api/v1/users/me/addresses", headers=h)).json()
    assert [a["label"] for a in listed if a["is_default"]] == ["Work"]
    other = await make_user(db)
    res = await api.put(
        f"/api/v1/users/me/addresses/{work['id']}",
        json={**base, "label": "Mine now"},
        headers=auth(other),
    )
    assert res.status_code == 404
    assert (
        await api.delete(f"/api/v1/users/me/addresses/{home['id']}", headers=h)
    ).status_code == 204


async def test_reviews_upsert_list_and_delete(api: AsyncClient, db) -> None:
    p = await make_product(db)
    user = await make_user(db)
    h = auth(user)
    path = f"/api/v1/products/{p.slug}/reviews"
    res = await api.put(
        path, json={"rating": 4, "title": "Lovely", "body": "Lasts all day"}, headers=h
    )
    assert res.status_code in (200, 201), res.text
    res = await api.put(path, json={"rating": 5, "title": "Even better"}, headers=h)
    assert res.json()["rating"] == 5  # one review per person, updated in place
    listed = (await api.get(path, headers=h)).json()
    assert listed["total"] == 1 and listed["my_review"]["rating"] == 5
    assert (await api.put(path, json={"rating": 6}, headers=h)).status_code == 422
    assert (await api.delete(path, headers=h)).status_code == 204
    assert (await api.get(path)).json()["total"] == 0


async def test_coupon_validation_rules(api: AsyncClient, db) -> None:
    now = datetime.now(UTC)
    db.add_all(
        [
            Coupon(
                code="TENOFF",
                discount_type="PERCENT",
                value=Decimal("10"),
                max_discount=Decimal("300"),
                min_subtotal=Decimal("1000"),
            ),
            Coupon(
                code="EXPIRED",
                discount_type="FIXED",
                value=Decimal("100"),
                ends_at=now - timedelta(days=1),
            ),
            Coupon(code="OFF", discount_type="FIXED", value=Decimal("100"), is_active=False),
        ]
    )
    await db.flush()
    v = "/api/v1/coupons/validate"
    h = auth(await make_user(db))
    ok = (await api.post(v, json={"code": "tenoff", "subtotal": "5000"}, headers=h)).json()
    assert Decimal(ok["discount_amount"]) == Decimal("300")  # 10% capped at 300
    assert (
        await api.post(v, json={"code": "TENOFF", "subtotal": "500"}, headers=h)
    ).status_code == 422
    assert (
        await api.post(v, json={"code": "EXPIRED", "subtotal": "5000"}, headers=h)
    ).status_code in (
        404,
        422,
    )
    assert (await api.post(v, json={"code": "OFF", "subtotal": "5000"}, headers=h)).status_code in (
        404,
        422,
    )
    assert (
        await api.post(v, json={"code": "NOPE", "subtotal": "5000"}, headers=h)
    ).status_code in (404, 422)

"""Admin operations: analytics (live + nightly rollup + cache), returns and
refunds, customers, coupons — and that each change lands in audit_logs."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.modules.analytics import service as analytics_service
from app.modules.analytics.models import AnalyticsDaily
from app.modules.audit.models import AuditLog
from app.modules.auth.models import RefreshToken
from app.modules.catalog.models import ProductVariant
from app.modules.coupons.models import Coupon
from app.modules.orders.models import Order
from tests.factories import auth, checkout_body, make_product, make_user

pytestmark = pytest.mark.db

A = "/api/v1/admin"


async def _checkout(api, customer, *lines):
    res = await api.post("/api/v1/orders", json=checkout_body(*lines), headers=auth(customer))
    assert res.status_code == 201, res.text
    return res.json()["order"]


async def _deliver(api, admin, order_id):
    for status in ("SHIPPED", "DELIVERED"):
        res = await api.patch(
            f"{A}/orders/{order_id}/status", json={"status": status}, headers=auth(admin)
        )
        assert res.status_code == 200, res.text


# --- analytics ---------------------------------------------------------------------


async def test_analytics_live_today_rollup_for_closed_days_and_cache(api: AsyncClient, db) -> None:
    admin = await make_user(db, "ADMIN")
    customer = await make_user(db)
    product = await make_product(db, price="1200.00")
    await _checkout(api, customer, (product, 2))

    today = datetime.now(UTC).date()
    yesterday = today - timedelta(days=1)
    # A closed day the nightly job already rolled up (numbers only it would know).
    db.add(
        AnalyticsDaily(
            day=yesterday,
            orders_count=7,
            revenue=Decimal("9100"),
            units=9,
            new_customers=3,
            refunds=Decimal("0"),
            by_status={},
            computed_at=datetime.now(UTC),
        )
    )
    await db.flush()

    params = {"start": yesterday.isoformat(), "end": today.isoformat()}
    res = await api.get(f"{A}/analytics", params=params, headers=auth(admin))
    assert res.status_code == 200, res.text
    body = res.json()
    days = {p["date"]: p for p in body["series"]}
    assert days[yesterday.isoformat()]["orders"] == 7  # from the rollup row
    assert days[today.isoformat()]["orders"] >= 1  # computed live
    assert Decimal(days[today.isoformat()]["revenue"]) >= Decimal("2400")
    assert body["source"] == {"rolled_up_days": 1, "live_days": 1}
    assert body["totals"]["orders"] == 7 + days[today.isoformat()]["orders"]
    assert body["previous_end"] == (yesterday - timedelta(days=1)).isoformat()
    assert any(p["name"] == product.name for p in body["top_products"])

    # Cached: a second identical request is served from the cache.
    again = (await api.get(f"{A}/analytics", params=params, headers=auth(admin))).json()
    assert again["generated_at"] == body["generated_at"]

    # Staff have the dashboard but not analytics.
    staff = await make_user(db, "STAFF")
    assert (await api.get(f"{A}/analytics", params=params, headers=auth(staff))).status_code == 403


async def test_analytics_rejects_bad_ranges(api: AsyncClient, db) -> None:
    admin = await make_user(db, "ADMIN")
    today = datetime.now(UTC).date()
    for start, end in [
        (today, today - timedelta(days=1)),  # backwards
        (today, today + timedelta(days=1)),  # future
        (today - timedelta(days=400), today),  # too long
    ]:
        res = await api.get(
            f"{A}/analytics",
            params={"start": start.isoformat(), "end": end.isoformat()},
            headers=auth(admin),
        )
        assert res.status_code == 422, (start, end)


async def test_rollup_writes_yesterday_and_backfills_the_week(db) -> None:
    written = await analytics_service.rollup(db)
    yesterday = datetime.now(UTC).date() - timedelta(days=1)
    assert yesterday in written and len(written) == 7
    rows = (
        await db.scalars(
            select(AnalyticsDaily.day).where(AnalyticsDaily.day > yesterday - timedelta(days=7))
        )
    ).all()
    assert set(rows) >= set(written)
    # Idempotent: a second run only rewrites yesterday.
    assert await analytics_service.rollup(db) == [yesterday]
    # A specific day can be recomputed on demand.
    assert date(2026, 1, 1) in await analytics_service.rollup(db, date(2026, 1, 1))


# --- returns + refunds -------------------------------------------------------------


async def test_return_lifecycle_partial_then_full_refund(api: AsyncClient, db) -> None:
    staff = await make_user(db, "STAFF")  # staff run returns
    customer = await make_user(db)
    product = await make_product(db, price="1000.00", stock=5)
    order = await _checkout(api, customer, (product, 2))
    total = Decimal(order["total"])
    item_id = order["items"][0]["id"]
    oid = order["id"]

    # Not delivered yet → no returns.
    early = await api.post(
        f"/api/v1/orders/{oid}/returns",
        json={"reason": "CHANGED_MIND", "items": [{"order_item_id": item_id, "quantity": 1}]},
        headers=auth(customer),
    )
    assert early.status_code == 422
    await _deliver(api, staff, oid)

    # Someone else's order is not found.
    other = await make_user(db)
    res = await api.post(
        f"/api/v1/orders/{oid}/returns",
        json={"reason": "DAMAGED", "items": [{"order_item_id": item_id, "quantity": 1}]},
        headers=auth(other),
    )
    assert res.status_code == 404

    res = await api.post(
        f"/api/v1/orders/{oid}/returns",
        json={
            "reason": "DAMAGED",
            "details": "Cap cracked",
            "items": [{"order_item_id": item_id, "quantity": 1}],
        },
        headers=auth(customer),
    )
    assert res.status_code == 201, res.text
    first = res.json()
    assert first["status"] == "REQUESTED" and Decimal(first["requested_amount"]) == 1000

    # Only one unit is left to return.
    res = await api.post(
        f"/api/v1/orders/{oid}/returns",
        json={"reason": "DAMAGED", "items": [{"order_item_id": item_id, "quantity": 2}]},
        headers=auth(customer),
    )
    assert res.status_code == 422

    rid = first["id"]
    # Refund before approval is refused; receive before approval too.
    assert (
        await api.post(f"{A}/returns/{rid}/refund", json={"amount": "10"}, headers=auth(staff))
    ).status_code == 422
    res = await api.post(f"{A}/returns/{rid}/approve", json={}, headers=auth(staff))
    assert res.json()["status"] == "APPROVED"

    stock_before = (await db.get(ProductVariant, product.variants[0].id)).stock_quantity
    res = await api.post(f"{A}/returns/{rid}/receive", json={"restock": True}, headers=auth(staff))
    assert res.json()["status"] == "RECEIVED" and res.json()["restocked"] is True
    await db.refresh(product.variants[0])
    assert product.variants[0].stock_quantity == stock_before + 1

    # Can't refund more than the order is worth.
    too_much = await api.post(
        f"{A}/returns/{rid}/refund", json={"amount": str(total + 1)}, headers=auth(staff)
    )
    assert too_much.status_code == 422
    res = await api.post(
        f"{A}/returns/{rid}/refund",
        json={"amount": "1000", "method": "ORIGINAL", "reference": "ESW-123"},
        headers=auth(staff),
    )
    assert res.status_code == 200, res.text
    done = res.json()
    assert done["status"] == "REFUNDED" and Decimal(done["refunded_amount"]) == 1000
    assert Decimal(done["order_refundable"]) == total - 1000
    o = await db.get(Order, order["id"])
    await db.refresh(o)
    assert o.status == "DELIVERED"  # partial refund: order stays delivered

    # Second return for the rest, refunded in full → the order is REFUNDED.
    res = await api.post(
        f"/api/v1/orders/{oid}/returns",
        json={"reason": "CHANGED_MIND", "items": [{"order_item_id": item_id, "quantity": 1}]},
        headers=auth(customer),
    )
    second = res.json()["id"]
    await api.post(f"{A}/returns/{second}/approve", json={}, headers=auth(staff))
    res = await api.post(
        f"{A}/returns/{second}/refund", json={"amount": str(total - 1000)}, headers=auth(staff)
    )
    assert res.status_code == 200, res.text
    await db.refresh(o)
    assert o.status == "REFUNDED" and o.payment_status == "REFUNDED"
    assert all(vo.status == "REFUNDED" for vo in o.vendor_orders)

    mine = (await api.get("/api/v1/users/me/returns", headers=auth(customer))).json()
    assert {r["id"] for r in mine} == {rid, second}
    logged = (await db.scalars(select(AuditLog.action).where(AuditLog.entity_id == rid))).all()
    assert "return_requests.update" in logged


async def test_reject_needs_a_reason_and_frees_the_items(api: AsyncClient, db) -> None:
    admin = await make_user(db, "ADMIN")
    customer = await make_user(db)
    product = await make_product(db)
    order = await _checkout(api, customer, (product, 1))
    await _deliver(api, admin, order["id"])
    body = {"reason": "OTHER", "items": [{"order_item_id": order["items"][0]["id"], "quantity": 1}]}
    rid = (
        await api.post(f"/api/v1/orders/{order['id']}/returns", json=body, headers=auth(customer))
    ).json()["id"]
    assert (
        await api.post(f"{A}/returns/{rid}/reject", json={"reason": ""}, headers=auth(admin))
    ).status_code == 422
    res = await api.post(
        f"{A}/returns/{rid}/reject", json={"reason": "Opened and used"}, headers=auth(admin)
    )
    assert res.json()["status"] == "REJECTED" and res.json()["decision_note"] == "Opened and used"
    # The rejected request no longer holds the item.
    again = await api.post(
        f"/api/v1/orders/{order['id']}/returns", json=body, headers=auth(customer)
    )
    assert again.status_code == 201


async def test_refund_by_status_change_is_in_the_ledger(api: AsyncClient, db) -> None:
    admin = await make_user(db, "ADMIN")
    customer = await make_user(db)
    order = await _checkout(api, customer, (await make_product(db), 1))
    res = await api.patch(
        f"{A}/orders/{order['id']}/status", json={"status": "REFUNDED"}, headers=auth(admin)
    )
    assert res.status_code == 200
    today = datetime.now(UTC).date().isoformat()
    analytics = (
        await api.get(f"{A}/analytics", params={"start": today, "end": today}, headers=auth(admin))
    ).json()
    assert Decimal(analytics["totals"]["refunds"]) >= Decimal(order["total"])


# --- customers ---------------------------------------------------------------------


async def test_customers_list_detail_and_block(api: AsyncClient, db) -> None:
    admin = await make_user(db, "ADMIN")
    customer = await make_user(db, email="block-me@example.com")
    db.add(
        RefreshToken(
            jti="j" * 32,
            user_id=customer.id,
            session_id="s" * 32,
            session_started_at=datetime.now(UTC),
            expires_at=datetime.now(UTC) + timedelta(days=1),
            created_at=datetime.now(UTC),
        )
    )
    await db.flush()

    res = await api.get(f"{A}/customers", params={"q": "block-me"}, headers=auth(admin))
    assert res.status_code == 200 and [c["email"] for c in res.json()["items"]] == [
        "block-me@example.com"
    ]
    # Staff accounts aren't customers.
    staff = await make_user(db, "STAFF")
    assert (await api.get(f"{A}/customers/{staff.id}", headers=auth(admin))).status_code == 404
    listed = (await api.get(f"{A}/customers", params={"size": 100}, headers=auth(admin))).json()
    assert str(staff.id) not in {c["id"] for c in listed["items"]}

    res = await api.patch(
        f"{A}/customers/{customer.id}/status",
        json={"active": False, "reason": "Chargeback fraud"},
        headers=auth(admin),
    )
    assert res.status_code == 200 and res.json()["is_active"] is False
    token = await db.scalar(select(RefreshToken).where(RefreshToken.user_id == customer.id))
    await db.refresh(token)
    assert token.revoked_at is not None
    actions = (
        await db.scalars(select(AuditLog.action).where(AuditLog.entity_id == str(customer.id)))
    ).all()
    assert {"users.update", "users.block"} <= set(actions)
    # Blocked accounts are refused by the API.
    assert (await api.get("/api/v1/auth/me", headers=auth(customer))).status_code == 401

    # Staff can look customers up but not block them.
    res = await api.patch(
        f"{A}/customers/{customer.id}/status", json={"active": True}, headers=auth(staff)
    )
    assert res.status_code == 403


# --- coupons -----------------------------------------------------------------------


async def test_coupon_edit_and_delete_rules(api: AsyncClient, db) -> None:
    admin = await make_user(db, "ADMIN")
    body = {"code": "spring10", "discount_type": "PERCENT", "value": "10"}
    created = (await api.post(f"{A}/coupons", json=body, headers=auth(admin))).json()
    cid = created["id"]
    res = await api.put(
        f"{A}/coupons/{cid}",
        json={**body, "code": "spring15", "value": "15", "is_active": False},
        headers=auth(admin),
    )
    assert res.status_code == 200
    assert (res.json()["code"], res.json()["value"], res.json()["is_active"]) == (
        "SPRING15",
        "15.00",
        False,
    )
    # A used coupon can't be deleted.
    coupon = await db.get(Coupon, created["id"])
    coupon.used_count = 1
    await db.flush()
    assert (await api.delete(f"{A}/coupons/{cid}", headers=auth(admin))).status_code == 409
    coupon.used_count = 0
    await db.flush()
    assert (await api.delete(f"{A}/coupons/{cid}", headers=auth(admin))).status_code == 204

"""Per-vendor order split + commission, the payment callback path, and payouts."""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.integrations.payments import stub_signature
from app.modules.catalog.models import ProductVariant
from app.modules.orders.models import Order
from app.modules.payments.models import PaymentEvent
from app.modules.settings.models import PlatformSetting
from app.shared.enums import VendorStatus
from tests.factories import auth, checkout_body, make_product, make_user, make_vendor

pytestmark = pytest.mark.db


async def _checkout(api, customer, *lines, method="COD"):
    res = await api.post(
        "/api/v1/orders", json=checkout_body(*lines, method=method), headers=auth(customer)
    )
    assert res.status_code == 201, res.text
    return res.json()


# --- split + commission -----------------------------------------------------------


async def test_order_is_split_per_seller_with_commission_snapshot(api: AsyncClient, db) -> None:
    default_vendor, _ = await make_vendor(db)  # platform default rate (15%)
    special_vendor, _ = await make_vendor(db, commission=Decimal("8.50"))
    p_platform = await make_product(db, price="1000")
    p_default = await make_product(db, vendor=default_vendor, price="2000")
    p_special = await make_product(db, vendor=special_vendor, price="3000")
    customer = await make_user(db)

    out = await _checkout(api, customer, (p_platform, 1), (p_default, 2), (p_special, 1))
    order = await db.get(Order, uuid.UUID(out["order"]["id"]))
    subs = {vo.vendor_id: vo for vo in order.vendor_orders}
    assert set(subs) == {None, default_vendor.id, special_vendor.id}

    platform = subs[None]
    assert platform.subtotal == Decimal("1000.00")
    assert platform.commission_rate is None and platform.vendor_earnings == 0

    d = subs[default_vendor.id]
    assert (d.subtotal, d.commission_rate) == (Decimal("4000.00"), Decimal("15.00"))
    assert (d.commission_amount, d.vendor_earnings) == (Decimal("600.00"), Decimal("3400.00"))

    s = subs[special_vendor.id]
    assert (s.commission_amount, s.vendor_earnings) == (Decimal("255.00"), Decimal("2745.00"))
    assert sum(len(vo.items) for vo in order.vendor_orders) == len(order.items) == 3

    # The customer sees one shipment per seller.
    detail = (await api.get(f"/api/v1/orders/{order.id}", headers=auth(customer))).json()
    assert len(detail["shipments"]) == 3
    assert {s["seller_name"] for s in detail["shipments"]} == {
        None,
        default_vendor.name,
        special_vendor.name,
    }


async def test_commission_change_does_not_touch_existing_orders(api: AsyncClient, db) -> None:
    vendor, _ = await make_vendor(db)
    p = await make_product(db, vendor=vendor, price="1000")
    out = await _checkout(api, await make_user(db), (p, 1))
    root = await make_user(db, "SUPER_ADMIN")
    res = await api.put(
        f"/api/v1/admin/vendors/{vendor.id}/commission",
        json={"commission_rate": "30"},
        headers=auth(root),
    )
    assert res.status_code == 200
    order = await db.get(Order, uuid.UUID(out["order"]["id"]))
    assert order.vendor_orders[0].commission_rate == Decimal("15.00")


async def test_shipping_comes_from_platform_settings(api: AsyncClient, db) -> None:
    db.add(PlatformSetting(key="shipping_fee", value="275"))
    db.add(PlatformSetting(key="free_shipping_threshold", value="999999"))
    await db.flush()
    p = await make_product(db, price="1000")
    out = await _checkout(api, await make_user(db), (p, 1))
    assert Decimal(out["order"]["shipping_fee"]) == Decimal("275")
    assert Decimal(out["order"]["total"]) == Decimal("1275")


async def test_suspended_vendor_products_cannot_be_bought(api: AsyncClient, db) -> None:
    vendor, _ = await make_vendor(db, status=VendorStatus.SUSPENDED)
    p = await make_product(db, vendor=vendor)
    res = await api.post(
        "/api/v1/orders", json=checkout_body((p, 1)), headers=auth(await make_user(db))
    )
    assert res.status_code == 409


async def test_vendors_ship_and_the_order_follows(api: AsyncClient, db) -> None:
    va, owner_a = await make_vendor(db)
    vb, owner_b = await make_vendor(db)
    pa, pb = await make_product(db, vendor=va), await make_product(db, vendor=vb)
    customer = await make_user(db)
    out = await _checkout(api, customer, (pa, 1), (pb, 1))
    order = await db.get(Order, uuid.UUID(out["order"]["id"]))
    subs = {vo.vendor_id: vo for vo in order.vendor_orders}

    def move(owner, vo, status, **extra):
        return api.patch(
            f"/api/v1/vendor/orders/{vo.id}/status",
            json={"status": status, **extra},
            headers=auth(owner),
        )

    res = await move(owner_a, subs[va.id], "SHIPPED", tracking_number="NCM-123")
    assert res.status_code == 200 and res.json()["tracking_number"] == "NCM-123"
    assert order.status == "PROCESSING"  # B hasn't shipped yet
    # Partially shipped: the customer can no longer cancel.
    cancel = await api.post(f"/api/v1/orders/{order.id}/cancel", headers=auth(customer))
    assert cancel.status_code == 422

    await move(owner_b, subs[vb.id], "SHIPPED")
    assert order.status == "SHIPPED"
    # Skipping a step is refused.
    assert (await move(owner_a, subs[va.id], "PROCESSING")).status_code == 422

    await move(owner_a, subs[va.id], "DELIVERED")
    assert order.status == "SHIPPED"
    await move(owner_b, subs[vb.id], "DELIVERED")
    assert order.status == "DELIVERED"


async def test_customer_cancel_cascades_and_restocks(api: AsyncClient, db) -> None:
    vendor, _ = await make_vendor(db)
    p = await make_product(db, vendor=vendor, stock=5)
    customer = await make_user(db)
    out = await _checkout(api, customer, (p, 2))
    variant = await db.get(ProductVariant, p.variants[0].id)
    assert variant.stock_quantity == 3

    res = await api.post(f"/api/v1/orders/{out['order']['id']}/cancel", headers=auth(customer))
    assert res.status_code == 200
    order = await db.get(Order, uuid.UUID(out["order"]["id"]))
    assert {vo.status for vo in order.vendor_orders} == {"CANCELLED"}
    assert variant.stock_quantity == 5


# --- payments ---------------------------------------------------------------------


@pytest.fixture
def stub_payments(monkeypatch):
    monkeypatch.setattr(settings, "payment_stub_enabled", True)


def _callback(ref: str, status: str, amount: str, event_id: str | None = None):
    event_id = event_id or uuid.uuid4().hex
    body = {"event_id": event_id, "provider_ref": ref, "status": status, "amount": amount}
    sig = stub_signature(event_id, ref, status, Decimal(amount))
    return body, {"X-Signature": sig}


async def test_online_payment_without_provider_is_501(api: AsyncClient, db) -> None:
    p = await make_product(db)
    res = await api.post(
        "/api/v1/orders",
        json=checkout_body((p, 1), method="ESEWA"),
        headers=auth(await make_user(db)),
    )
    assert res.status_code == 501


async def test_signed_callback_marks_order_paid_once(api: AsyncClient, db, stub_payments) -> None:
    vendor, _ = await make_vendor(db)
    p = await make_product(db, vendor=vendor, price="1000")
    out = await _checkout(api, await make_user(db), (p, 1), method="KHALTI")
    assert out["order"]["status"] == "PENDING_PAYMENT"
    assert out["payment_redirect_url"].startswith(settings.frontend_url)
    order = await db.get(Order, uuid.UUID(out["order"]["id"]))
    assert order.vendor_orders[0].status == "PENDING"
    payment = order.payments[0]
    payment_id = payment.id

    body, headers = _callback(payment.provider_ref, "succeeded", out["order"]["total"])
    res = await api.post("/api/v1/payments/stub/callback", json=body, headers=headers)
    assert res.json() == {"received": True, "outcome": "applied"}
    assert (order.status, order.payment_status) == ("PROCESSING", "PAID")
    assert order.vendor_orders[0].status == "PROCESSING"

    # Provider retries the same notification: recorded once, nothing changes.
    again = await api.post("/api/v1/payments/stub/callback", json=body, headers=headers)
    assert again.json()["outcome"] == "duplicate"
    events = await db.scalars(select(PaymentEvent).where(PaymentEvent.payment_id == payment_id))
    assert len(events.all()) == 1


async def test_callback_rejects_bad_signature_and_wrong_amount(
    api: AsyncClient, db, stub_payments
) -> None:
    p = await make_product(db, price="1000")
    out = await _checkout(api, await make_user(db), (p, 1), method="ESEWA")
    order = await db.get(Order, uuid.UUID(out["order"]["id"]))
    ref = order.payments[0].provider_ref

    body, _ = _callback(ref, "succeeded", out["order"]["total"])
    forged = await api.post(
        "/api/v1/payments/stub/callback", json=body, headers={"X-Signature": "0" * 64}
    )
    assert forged.status_code == 401

    body, headers = _callback(ref, "succeeded", "1.00")
    short = await api.post("/api/v1/payments/stub/callback", json=body, headers=headers)
    assert short.json()["outcome"] == "amount_mismatch"
    assert order.payment_status == "PENDING"


async def test_failed_payment_cancels_and_restocks(api: AsyncClient, db, stub_payments) -> None:
    p = await make_product(db, price="1000", stock=4)
    out = await _checkout(api, await make_user(db), (p, 3), method="STRIPE")
    order = await db.get(Order, uuid.UUID(out["order"]["id"]))
    variant = await db.get(ProductVariant, p.variants[0].id)
    assert variant.stock_quantity == 1

    body, headers = _callback(order.payments[0].provider_ref, "failed", out["order"]["total"])
    res = await api.post("/api/v1/payments/stub/callback", json=body, headers=headers)
    assert res.json()["outcome"] == "applied"
    assert (order.status, order.payment_status) == ("PAYMENT_FAILED", "FAILED")
    assert order.vendor_orders[0].status == "CANCELLED"
    assert variant.stock_quantity == 4


async def test_unknown_provider_is_404(api: AsyncClient) -> None:
    res = await api.post("/api/v1/payments/nope/callback", json={})
    assert res.status_code == 404


# --- payouts ----------------------------------------------------------------------


async def _delivered_and_paid(api, db, vendor, owner, price="2000"):
    """A COD order for `vendor`, delivered by the vendor and marked paid."""
    p = await make_product(db, vendor=vendor, price=price)
    out = await _checkout(api, await make_user(db), (p, 1))
    order = await db.get(Order, uuid.UUID(out["order"]["id"]))
    vo = order.vendor_orders[0]
    for status in ("SHIPPED", "DELIVERED"):
        r = await api.patch(
            f"/api/v1/vendor/orders/{vo.id}/status", json={"status": status}, headers=auth(owner)
        )
        assert r.status_code == 200
    admin = await make_user(db, "ADMIN")
    assert (
        await api.post(f"/api/v1/admin/orders/{order.id}/mark-paid", headers=auth(admin))
    ).status_code == 200
    return vo


async def test_payout_lifecycle(api: AsyncClient, db) -> None:
    vendor, owner = await make_vendor(db)
    vo1 = await _delivered_and_paid(api, db, vendor, owner, "2000")
    vo2 = await _delivered_and_paid(api, db, vendor, owner, "3000")
    # Delivered but unpaid COD: not eligible yet.
    p = await make_product(db, vendor=vendor)
    await _checkout(api, await make_user(db), (p, 1))

    admin = await make_user(db, "ADMIN")
    as_admin = auth(admin)
    balances = (await api.get("/api/v1/admin/payouts/balances", headers=as_admin)).json()
    mine = next(b for b in balances if b["vendor_id"] == str(vendor.id))
    assert mine["eligible_orders"] == 2
    assert Decimal(mine["gross_amount"]) == Decimal("5000")
    assert Decimal(mine["commission_amount"]) == Decimal("750")
    assert Decimal(mine["net_amount"]) == Decimal("4250")

    created = await api.post(
        "/api/v1/admin/payouts", json={"vendor_id": str(vendor.id)}, headers=as_admin
    )
    assert created.status_code == 201
    payout = created.json()
    assert Decimal(payout["net_amount"]) == Decimal("4250") and payout["order_count"] == 2
    assert {line["vendor_order_id"] for line in payout["lines"]} == {str(vo1.id), str(vo2.id)}

    # Nothing left to pay → can't generate a second payout for the same orders.
    twice = await api.post(
        "/api/v1/admin/payouts", json={"vendor_id": str(vendor.id)}, headers=as_admin
    )
    assert twice.status_code == 422

    # The vendor sees it in the portal…
    portal = await api.get(f"/api/v1/vendor/payouts/{payout['id']}", headers=auth(owner))
    assert portal.status_code == 200
    summary = (await api.get("/api/v1/vendor/summary", headers=auth(owner))).json()
    assert Decimal(summary["earnings"]["in_pending_payouts"]) == Decimal("4250")

    # …cancelling releases the orders, regenerating picks them up again…
    await api.post(f"/api/v1/admin/payouts/{payout['id']}/cancel", headers=as_admin)
    regen = await api.post(
        "/api/v1/admin/payouts", json={"vendor_id": str(vendor.id)}, headers=as_admin
    )
    assert regen.status_code == 201
    # …and paying records the reference.
    paid = await api.post(
        f"/api/v1/admin/payouts/{regen.json()['id']}/mark-paid",
        json={"reference": "NIBL-TXN-881"},
        headers=as_admin,
    )
    assert paid.json()["status"] == "PAID" and paid.json()["reference"] == "NIBL-TXN-881"
    summary = (await api.get("/api/v1/vendor/summary", headers=auth(owner))).json()
    assert Decimal(summary["earnings"]["paid_out"]) == Decimal("4250")


async def test_payout_minimum_is_enforced(api: AsyncClient, db) -> None:
    vendor, owner = await make_vendor(db)
    await _delivered_and_paid(api, db, vendor, owner, "500")  # earns 425 < 1000 minimum
    admin = await make_user(db, "ADMIN")
    res = await api.post(
        "/api/v1/admin/payouts", json={"vendor_id": str(vendor.id)}, headers=auth(admin)
    )
    assert res.status_code == 422 and "minimum" in res.json()["error"]["message"]


async def test_payouts_require_permission(api: AsyncClient, db) -> None:
    staff = await make_user(db, "STAFF")
    assert (await api.get("/api/v1/admin/payouts", headers=auth(staff))).status_code == 403

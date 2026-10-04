"""Vendor data isolation: vendor A must never read or change vendor B's data.

Every portal query is scoped by the caller's own vendor id in the repository
layer, so a foreign id is indistinguishable from a missing one (404 — not 403,
which would confirm the id exists)."""

from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog import repository as catalog_repo
from app.modules.orders import repository as orders_repo
from app.modules.orders.models import Order, VendorOrder
from app.modules.payouts import repository as payouts_repo
from app.modules.payouts.models import Payout
from app.shared.enums import PayoutStatus, ProductStatus, VendorOrderStatus
from tests.factories import auth, checkout_body, make_product, make_user, make_vendor

pytestmark = pytest.mark.db

PRODUCT_BODY = {
    "sku": "ISO-1",
    "name": "Isolation Test",
    "product_type": "perfume",
    "base_price": "1500",
    "variants": [{"name": "50 ml", "price": "1500", "stock_quantity": 5}],
}


@pytest.fixture
async def two_vendors(db: AsyncSession):
    a, owner_a = await make_vendor(db)
    b, owner_b = await make_vendor(db)
    product_b = await make_product(db, vendor=b, status=ProductStatus.DRAFT)
    return a, owner_a, b, owner_b, product_b


# --- repository layer -----------------------------------------------------------


async def test_repository_never_returns_another_vendors_product(db, two_vendors) -> None:
    a, _, b, _, product_b = two_vendors
    assert await catalog_repo.get_vendor_product(db, a.id, product_b.id) is None
    assert await catalog_repo.get_vendor_product(db, b.id, product_b.id) is not None

    rows_a, total_a = await catalog_repo.list_vendor_products(db, a.id, None, 0, 50)
    assert total_a == 0 and rows_a == []
    variant_b = product_b.variants[0]
    assert await catalog_repo.get_vendor_variant_for_update(db, a.id, variant_b.id) is None


async def test_platform_products_are_not_any_vendors(db, two_vendors) -> None:
    a, *_ = two_vendors
    platform = await make_product(db, vendor=None)
    assert await catalog_repo.get_vendor_product(db, a.id, platform.id) is None


# --- products over HTTP ---------------------------------------------------------


async def test_vendor_cannot_read_or_change_anothers_product(api: AsyncClient, two_vendors) -> None:
    _, owner_a, _, owner_b, product_b = two_vendors
    pid = product_b.id
    as_a = auth(owner_a)

    assert (await api.get(f"/api/v1/vendor/products/{pid}", headers=as_a)).status_code == 404
    body = {**PRODUCT_BODY, "sku": "ISO-HIJACK"}
    put = await api.put(f"/api/v1/vendor/products/{pid}", json=body, headers=as_a)
    assert put.status_code == 404
    submit = await api.post(f"/api/v1/vendor/products/{pid}/submit", headers=as_a)
    assert submit.status_code == 404
    delete = await api.delete(f"/api/v1/vendor/products/{pid}", headers=as_a)
    assert delete.status_code == 404
    stock = await api.put(
        f"/api/v1/vendor/variants/{product_b.variants[0].id}/stock",
        json={"stock_quantity": 0},
        headers=as_a,
    )
    assert stock.status_code == 404

    listing = await api.get("/api/v1/vendor/products", headers=as_a)
    assert listing.status_code == 200 and listing.json()["total"] == 0

    # B still sees (and owns) it, untouched.
    as_b = auth(owner_b)
    mine = await api.get(f"/api/v1/vendor/products/{pid}", headers=as_b)
    assert mine.status_code == 200
    assert mine.json()["variants"][0]["stock_quantity"] == 10


async def test_created_product_belongs_to_the_caller(api: AsyncClient, db, two_vendors) -> None:
    a, owner_a, b, _, _ = two_vendors
    res = await api.post("/api/v1/vendor/products", json=PRODUCT_BODY, headers=auth(owner_a))
    assert res.status_code == 201, res.text
    created = res.json()
    # Ownership comes from the session's vendor, never the payload.
    assert created["vendor_id"] == str(a.id)
    assert created["status"] == "DRAFT"
    assert await catalog_repo.get_vendor_product(db, b.id, created["id"]) is None


# --- orders + payouts -----------------------------------------------------------


@pytest.fixture
async def order_for_both(api: AsyncClient, db, two_vendors):
    a, owner_a, b, owner_b, _ = two_vendors
    pa = await make_product(db, vendor=a)
    pb = await make_product(db, vendor=b)
    customer = await make_user(db)
    res = await api.post(
        "/api/v1/orders", json=checkout_body((pa, 1), (pb, 2)), headers=auth(customer)
    )
    assert res.status_code == 201, res.text
    order = await db.get(Order, res.json()["order"]["id"])
    by_vendor = {vo.vendor_id: vo for vo in order.vendor_orders}
    return owner_a, owner_b, by_vendor[a.id], by_vendor[b.id]


async def test_vendor_sees_only_their_own_sub_order(api: AsyncClient, db, order_for_both) -> None:
    owner_a, _, vo_a, vo_b = order_for_both
    as_a = auth(owner_a)

    listing = (await api.get("/api/v1/vendor/orders", headers=as_a)).json()
    assert [o["id"] for o in listing["items"]] == [str(vo_a.id)]
    # A's view contains only A's line, not B's.
    assert len(listing["items"][0]["items"]) == 1

    assert (await api.get(f"/api/v1/vendor/orders/{vo_b.id}", headers=as_a)).status_code == 404
    ship = await api.patch(
        f"/api/v1/vendor/orders/{vo_b.id}/status", json={"status": "SHIPPED"}, headers=as_a
    )
    assert ship.status_code == 404
    await db.refresh(vo_b)
    assert vo_b.status == VendorOrderStatus.PROCESSING


async def test_vendor_orders_repository_is_scoped(db, order_for_both) -> None:
    _, _, vo_a, vo_b = order_for_both
    assert await orders_repo.get_vendor_order(db, vo_a.vendor_id, vo_b.id) is None
    rows, total = await orders_repo.list_vendor_orders(db, vo_a.vendor_id, None, 0, 50)
    assert total == 1 and rows[0].id == vo_a.id


async def test_vendor_cannot_see_anothers_payout(api: AsyncClient, db, two_vendors) -> None:
    a, owner_a, b, owner_b, _ = two_vendors
    payout_b = Payout(
        vendor_id=b.id,
        status=PayoutStatus.PENDING,
        gross_amount=Decimal("100"),
        commission_amount=Decimal("15"),
        net_amount=Decimal("85"),
        order_count=1,
    )
    db.add(payout_b)
    await db.flush()

    as_a = auth(owner_a)
    assert (await api.get(f"/api/v1/vendor/payouts/{payout_b.id}", headers=as_a)).status_code == 404
    assert (await api.get("/api/v1/vendor/payouts", headers=as_a)).json()["total"] == 0
    assert await payouts_repo.get_for_vendor(db, a.id, payout_b.id) is None

    mine = await api.get(f"/api/v1/vendor/payouts/{payout_b.id}", headers=auth(owner_b))
    assert mine.status_code == 200


async def test_non_vendors_cannot_use_the_portal(api: AsyncClient, db) -> None:
    customer = await make_user(db)
    assert (await api.get("/api/v1/vendor/products", headers=auth(customer))).status_code == 403
    # A pending applicant has no VENDOR role yet either.
    _, applicant = await make_vendor(db, status="PENDING")
    assert (await api.get("/api/v1/vendor/summary", headers=auth(applicant))).status_code == 403


async def test_sub_orders_are_not_visible_across_vendors_in_db(db, order_for_both) -> None:
    """Sanity: the split itself put each vendor's lines on their own sub-order."""
    _, _, vo_a, vo_b = order_for_both
    assert isinstance(vo_a, VendorOrder)
    assert {i.id for i in vo_a.items}.isdisjoint({i.id for i in vo_b.items})

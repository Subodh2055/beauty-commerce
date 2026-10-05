"""Fragrance taxonomy filters, the moderation workflow, and catalog caching."""

import pytest
from httpx import AsyncClient

from app.core import cache
from app.shared.enums import ProductStatus, VendorStatus
from tests.factories import (
    auth,
    make_family,
    make_note,
    make_product,
    make_user,
    make_vendor,
)

pytestmark = pytest.mark.db


def _slugs(res) -> set[str]:
    return {p["slug"] for p in res.json()["items"]}


async def test_filter_by_gender_family_and_note(api: AsyncClient, db) -> None:
    woody = await make_family(db, "Woody")
    floral = await make_family(db, "Floral")
    oud, rose = await make_note(db, "Oud"), await make_note(db, "Rose")
    a = await make_product(db, gender="MEN", family=woody, notes=[(oud, "BASE")])
    b = await make_product(db, gender="WOMEN", family=floral, notes=[(rose, "HEART")])
    c = await make_product(db, gender="UNISEX", family=woody, notes=[(oud, "TOP"), (rose, "BASE")])

    by = lambda **q: api.get("/api/v1/products", params={"size": 100, **q})  # noqa: E731
    assert {a.slug, b.slug, c.slug} <= _slugs(await by())
    men = _slugs(await by(gender="MEN"))
    assert a.slug in men and b.slug not in men
    assert _slugs(await by(family=woody.slug)) >= {a.slug, c.slug}
    assert b.slug not in _slugs(await by(family=woody.slug))
    with_oud = _slugs(await by(note=oud.slug))
    assert with_oud >= {a.slug, c.slug} and b.slug not in with_oud

    facets = (await api.get("/api/v1/products/facets", params={"family": woody.slug})).json()
    assert {f["slug"] for f in facets["families"]} == {woody.slug}
    assert {g["slug"] for g in facets["genders"]} >= {"MEN", "UNISEX"}


async def test_detail_shows_note_pyramid_size_and_seller(api: AsyncClient, db) -> None:
    vendor, _ = await make_vendor(db)
    berg = await make_note(db, "Bergamot")
    iris = await make_note(db, "Iris")
    musk = await make_note(db, "Musk")
    p = await make_product(
        db, vendor=vendor, notes=[(berg, "TOP"), (iris, "HEART"), (musk, "BASE")]
    )
    detail = (await api.get(f"/api/v1/products/{p.slug}")).json()
    assert [n["name"] for n in detail["notes"]["top"]] == ["Bergamot"]
    assert [n["name"] for n in detail["notes"]["heart"]] == ["Iris"]
    assert [n["name"] for n in detail["notes"]["base"]] == ["Musk"]
    assert float(detail["variants"][0]["size_ml"]) == 50
    assert detail["vendor"]["slug"] == vendor.slug


async def test_public_taxonomy_endpoints(api: AsyncClient, db) -> None:
    fam = await make_family(db, "Citrus")
    await make_note(db, "Yuzu")
    families = (await api.get("/api/v1/fragrance/families")).json()
    assert fam.slug in {f["slug"] for f in families}
    notes = (await api.get("/api/v1/fragrance/notes")).json()
    assert any(n["name"] == "Yuzu" for n in notes)


# --- moderation workflow ---------------------------------------------------------

VENDOR_PRODUCT = {
    "sku": "MOD-1",
    "name": "Moderated Mist",
    "product_type": "perfume",
    "gender": "UNISEX",
    "base_price": "2500",
    "variants": [{"name": "30 ml", "size_ml": "30", "price": "2500", "stock_quantity": 4}],
}


async def test_vendor_product_needs_approval_to_go_live(api: AsyncClient, db) -> None:
    _, owner = await make_vendor(db)
    admin = await make_user(db, "ADMIN")
    as_vendor = auth(owner)

    created = (
        await api.post("/api/v1/vendor/products", json=VENDOR_PRODUCT, headers=as_vendor)
    ).json()
    pid, slug = created["id"], created["slug"]
    assert created["status"] == "DRAFT"
    assert (await api.get(f"/api/v1/products/{slug}")).status_code == 404

    # Can't approve something that wasn't submitted.
    early = await api.post(f"/api/v1/admin/products/{pid}/approve", headers=auth(admin))
    assert early.status_code == 422

    submitted = await api.post(f"/api/v1/vendor/products/{pid}/submit", headers=as_vendor)
    assert submitted.json()["status"] == "PENDING"
    assert (await api.get(f"/api/v1/products/{slug}")).status_code == 404

    approved = await api.post(f"/api/v1/admin/products/{pid}/approve", headers=auth(admin))
    assert approved.status_code == 200 and approved.json()["status"] == "PUBLISHED"
    assert (await api.get(f"/api/v1/products/{slug}")).status_code == 200

    # Editing a live product sends it back to review (and off the storefront).
    edit = {**VENDOR_PRODUCT, "name": "Moderated Mist (new formula)"}
    edited = await api.put(f"/api/v1/vendor/products/{pid}", json=edit, headers=as_vendor)
    assert edited.json()["status"] == "PENDING"
    assert (await api.get(f"/api/v1/products/{slug}")).status_code == 404

    rejected = await api.post(
        f"/api/v1/admin/products/{pid}/reject",
        json={"reason": "Label photo missing"},
        headers=auth(admin),
    )
    body = rejected.json()
    assert body["status"] == "REJECTED" and body["rejection_reason"] == "Label photo missing"
    # Rejected → fix → resubmit is allowed.
    again = await api.post(f"/api/v1/vendor/products/{pid}/submit", headers=as_vendor)
    assert again.json()["status"] == "PENDING" and again.json()["rejection_reason"] is None


async def test_stock_change_skips_re_review(api: AsyncClient, db) -> None:
    vendor, owner = await make_vendor(db)
    p = await make_product(db, vendor=vendor, stock=3)
    res = await api.put(
        f"/api/v1/vendor/variants/{p.variants[0].id}/stock",
        json={"stock_quantity": 12},
        headers=auth(owner),
    )
    assert res.status_code == 200 and res.json()["stock_quantity"] == 12
    await db.refresh(p)
    assert p.status == ProductStatus.PUBLISHED


async def test_moderation_requires_permission(api: AsyncClient, db) -> None:
    staff = await make_user(db, "STAFF")
    p = await make_product(db, status=ProductStatus.PENDING)
    res = await api.post(f"/api/v1/admin/products/{p.id}/approve", headers=auth(staff))
    assert res.status_code == 403


async def test_suspended_vendor_is_hidden_and_read_only(api: AsyncClient, db) -> None:
    vendor, owner = await make_vendor(db)
    p = await make_product(db, vendor=vendor)
    assert (await api.get(f"/api/v1/products/{p.slug}")).status_code == 200

    vendor.status = VendorStatus.SUSPENDED
    await db.flush()
    await cache.invalidate("catalog")
    assert (await api.get(f"/api/v1/products/{p.slug}")).status_code == 404
    # Can still read the portal, can't change anything.
    assert (await api.get("/api/v1/vendor/products", headers=auth(owner))).status_code == 200
    res = await api.post(f"/api/v1/vendor/products/{p.id}/archive", headers=auth(owner))
    assert res.status_code == 403


async def test_admin_write_round_trips_taxonomy(api: AsyncClient, db) -> None:
    admin = await make_user(db, "ADMIN")
    fam = await make_family(db, "Amber")
    vanilla, labdanum = await make_note(db, "Vanilla"), await make_note(db, "Labdanum")
    body = {
        "sku": "ADM-TAX-1",
        "name": "Amber Study",
        "product_type": "perfume",
        "gender": "WOMEN",
        "fragrance_family_id": str(fam.id),
        "notes": [
            {"note_id": str(labdanum.id), "position": "BASE"},
            {"note_id": str(vanilla.id), "position": "BASE"},
            {"note_id": str(vanilla.id), "position": "BASE"},  # duplicate collapses
        ],
        "base_price": "4200",
        "status": "PUBLISHED",
        "variants": [{"name": "75 ml", "size_ml": "75", "price": "4200", "stock_quantity": 2}],
    }
    res = await api.post("/api/v1/admin/products", json=body, headers=auth(admin))
    assert res.status_code == 201, res.text
    out = res.json()
    assert out["gender"] == "WOMEN" and out["fragrance_family_id"] == str(fam.id)
    assert [
        (n["note_id"], n["position"]) for n in sorted(out["notes"], key=lambda n: n["sort_order"])
    ] == [
        (str(labdanum.id), "BASE"),
        (str(vanilla.id), "BASE"),
    ]
    assert float(out["variants"][0]["size_ml"]) == 75

    # Composite-key rows get their real id in the audit log once flushed.
    from sqlalchemy import select

    from app.modules.audit.models import AuditLog

    note_logs = (
        await db.scalars(
            select(AuditLog).where(
                AuditLog.entity_type == "product_notes",
                AuditLog.entity_id.like(f"{out['id']},%"),
            )
        )
    ).all()
    assert len(note_logs) == 2

    bad = {**body, "sku": "ADM-TAX-2", "notes": [{"note_id": str(fam.id), "position": "TOP"}]}
    assert (
        await api.post("/api/v1/admin/products", json=bad, headers=auth(admin))
    ).status_code == 422


# --- caching ---------------------------------------------------------------------


async def test_public_reads_are_cached_and_invalidated_by_writes(
    api: AsyncClient, db, memory_cache
) -> None:
    admin = await make_user(db, "ADMIN")
    p = await make_product(db, name="Cache Original")

    first = await api.get(f"/api/v1/products/{p.slug}")
    assert first.json()["name"] == "Cache Original"

    # A write that bypasses the app (raw ORM, no commit) is invisible: we're
    # reading the cached copy.
    p.name = "Changed Behind The Cache"
    await db.flush()
    assert (await api.get(f"/api/v1/products/{p.slug}")).json()["name"] == "Cache Original"

    # A real write through the app commits → invalidation → fresh read.
    res = await api.patch(
        f"/api/v1/admin/products/{p.id}", json={"is_featured": True}, headers=auth(admin)
    )
    assert res.status_code == 200
    await cache.drain()
    fresh = (await api.get(f"/api/v1/products/{p.slug}")).json()
    assert fresh["name"] == "Changed Behind The Cache" and fresh["is_featured"] is True


async def test_checkout_stock_changes_do_not_flush_the_cache(api: AsyncClient, db) -> None:
    from tests.factories import checkout_body

    p = await make_product(db, stock=5)
    await db.commit()  # the factory's own insert is a catalog change; settle it first
    await cache.drain()
    before = await cache._version("catalog")
    customer = await make_user(db)
    res = await api.post("/api/v1/orders", json=checkout_body((p, 1)), headers=auth(customer))
    assert res.status_code == 201
    await cache.drain()
    assert await cache._version("catalog") == before  # 5 → 4: still in stock

    sold_out = await api.post("/api/v1/orders", json=checkout_body((p, 4)), headers=auth(customer))
    assert sold_out.status_code == 201
    await cache.drain()
    assert await cache._version("catalog") == before + 1  # 4 → 0 flips in_stock


async def test_cache_unit_behaviour() -> None:
    from pydantic import TypeAdapter

    backend = cache.MemoryCache()
    cache.set_backend(backend)
    calls = 0

    async def load() -> list[int]:
        nonlocal calls
        calls += 1
        return [calls]

    ad = TypeAdapter(list[int])
    assert await cache.get_or_load("t", "k", ad, load) == [1]
    assert await cache.get_or_load("t", "k", ad, load) == [1]  # hit
    await cache.invalidate("t")
    assert await cache.get_or_load("t", "k", ad, load) == [2]  # new version → reload


async def test_cache_outage_fails_open() -> None:
    from pydantic import TypeAdapter

    class Down:
        async def get(self, key):
            raise ConnectionError("redis down")

        async def set(self, key, value, ttl):
            raise ConnectionError("redis down")

        async def incr(self, key):
            raise ConnectionError("redis down")

    cache.set_backend(Down())

    async def load() -> list[int]:
        return [42]

    assert await cache.get_or_load("t", "k", TypeAdapter(list[int]), load) == [42]
    await cache.invalidate("t")  # must not raise


async def test_unknown_product_404_is_cached_too(api: AsyncClient, db) -> None:
    assert (await api.get("/api/v1/products/does-not-exist")).status_code == 404
    assert (await api.get("/api/v1/products/does-not-exist")).status_code == 404

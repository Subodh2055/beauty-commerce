"""Vendor applications, platform settings, CMS banners and support tickets."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.modules.audit.models import AuditLog
from app.modules.users.models import User
from tests.factories import auth, make_user

pytestmark = pytest.mark.db

APPLICATION = {
    "name": "Maison Lumière",
    "contact_email": "hello@lumiere.example.com",
    "contact_phone": "9801234567",
    "tax_id": "PAN-600123456",
}


# --- vendors ----------------------------------------------------------------------


async def test_application_review_lifecycle(api: AsyncClient, db) -> None:
    applicant = await make_user(db)
    admin = await make_user(db, "ADMIN")
    as_admin = auth(admin)

    applied = await api.post("/api/v1/vendors/apply", json=APPLICATION, headers=auth(applicant))
    assert applied.status_code == 201
    vendor = applied.json()
    assert (vendor["status"], vendor["slug"]) == ("PENDING", "maison-lumi-re")
    dup = await api.post("/api/v1/vendors/apply", json=APPLICATION, headers=auth(applicant))
    assert dup.status_code == 409
    # Not public until approved.
    assert (await api.get(f"/api/v1/vendors/{vendor['slug']}")).status_code == 404

    pending = await api.get("/api/v1/admin/vendors", params={"status": "PENDING"}, headers=as_admin)
    assert vendor["id"] in {v["id"] for v in pending.json()["items"]}

    rejected = await api.post(
        f"/api/v1/admin/vendors/{vendor['id']}/reject",
        json={"reason": "PAN certificate unreadable"},
        headers=as_admin,
    )
    assert rejected.json()["status"] == "REJECTED"
    # A rejected applicant may re-apply.
    reapplied = await api.post("/api/v1/vendors/apply", json=APPLICATION, headers=auth(applicant))
    assert reapplied.status_code == 201 and reapplied.json()["status"] == "PENDING"

    approved = await api.post(
        f"/api/v1/admin/vendors/{vendor['id']}/approve", json={}, headers=as_admin
    )
    assert approved.json()["status"] == "APPROVED"
    owner = await db.get(User, applicant.id)
    assert owner.has_role("VENDOR")
    grant = await db.scalar(
        select(AuditLog).where(
            AuditLog.action == "user_roles.grant", AuditLog.entity_id == str(applicant.id)
        )
    )
    assert grant is not None and grant.changes == {"role": "VENDOR"}
    assert (await api.get(f"/api/v1/vendors/{vendor['slug']}")).status_code == 200
    assert (await api.get("/api/v1/vendor/summary", headers=auth(owner))).status_code == 200

    suspended = await api.post(
        f"/api/v1/admin/vendors/{vendor['id']}/suspend",
        json={"reason": "Counterfeit report under review"},
        headers=as_admin,
    )
    assert suspended.json()["status"] == "SUSPENDED"
    reinstated = await api.post(
        f"/api/v1/admin/vendors/{vendor['id']}/reinstate", json={}, headers=as_admin
    )
    assert reinstated.json()["status"] == "APPROVED"


async def test_vendor_profile_self_service(api: AsyncClient, db) -> None:
    user = await make_user(db)
    assert (await api.get("/api/v1/vendors/me", headers=auth(user))).status_code == 404
    await api.post("/api/v1/vendors/apply", json=APPLICATION, headers=auth(user))
    res = await api.patch(
        "/api/v1/vendors/me", json={"description": "Small-batch attars"}, headers=auth(user)
    )
    assert res.json()["description"] == "Small-batch attars"
    assert res.json()["name"] == APPLICATION["name"]  # name isn't self-editable


async def test_applications_can_be_closed(api: AsyncClient, db) -> None:
    root = await make_user(db, "SUPER_ADMIN")
    await api.patch(
        "/api/v1/admin/settings", json={"vendor_applications_open": False}, headers=auth(root)
    )
    res = await api.post(
        "/api/v1/vendors/apply", json=APPLICATION, headers=auth(await make_user(db))
    )
    assert res.status_code == 422


async def test_vendor_admin_requires_permission(api: AsyncClient, db) -> None:
    staff = await make_user(db, "STAFF")
    assert (await api.get("/api/v1/admin/vendors", headers=auth(staff))).status_code == 403


# --- settings ---------------------------------------------------------------------


async def test_settings_defaults_update_and_public_view(api: AsyncClient, db) -> None:
    root = await make_user(db, "SUPER_ADMIN")
    defaults = (await api.get("/api/v1/admin/settings", headers=auth(root))).json()
    assert defaults["default_commission_rate"] == "15.00"

    res = await api.patch(
        "/api/v1/admin/settings",
        json={"default_commission_rate": "12.5", "shipping_fee": "200"},
        headers=auth(root),
    )
    assert res.status_code == 200
    assert res.json()["default_commission_rate"] == "12.5"
    public = (await api.get("/api/v1/settings/public")).json()
    assert public["shipping_fee"] == "200"
    assert "default_commission_rate" not in public

    bad = await api.patch(
        "/api/v1/admin/settings", json={"default_commission_rate": "150"}, headers=auth(root)
    )
    assert bad.status_code == 422


# --- CMS ----------------------------------------------------------------------------


async def test_banner_scheduling_and_cache_invalidation(api: AsyncClient, db) -> None:
    editor = await make_user(db, "ADMIN")
    now = datetime.now(UTC)

    async def create(title, **extra):
        body = {"title": title, "image_url": "/uploads/hero.webp", **extra}
        res = await api.post("/api/v1/admin/banners", json=body, headers=auth(editor))
        assert res.status_code == 201, res.text
        return res.json()

    live = await create("Monsoon Edit", sort_order=2)
    await create("Future", starts_at=(now + timedelta(days=1)).isoformat())
    await create("Expired", ends_at=(now - timedelta(days=1)).isoformat())
    await create("Hidden", is_active=False)
    first = await create("Dashain Gifting", sort_order=1)

    titles = [b["title"] for b in (await api.get("/api/v1/cms/banners")).json()]
    assert titles == ["Dashain Gifting", "Monsoon Edit"]

    upd = await api.put(
        f"/api/v1/admin/banners/{first['id']}",
        json={"title": "Dashain Gifting", "image_url": "/uploads/x.webp", "is_active": False},
        headers=auth(editor),
    )
    assert upd.status_code == 200
    # Written through the app → cache invalidated → change visible immediately.
    titles = [b["title"] for b in (await api.get("/api/v1/cms/banners")).json()]
    assert titles == [live["title"]]

    staff = await make_user(db, "STAFF")
    assert (await api.get("/api/v1/admin/banners", headers=auth(staff))).status_code == 403
    invalid = await api.post(
        "/api/v1/admin/banners",
        json={
            "title": "x",
            "image_url": "/a.webp",
            "starts_at": now.isoformat(),
            "ends_at": (now - timedelta(hours=1)).isoformat(),
        },
        headers=auth(editor),
    )
    assert invalid.status_code == 422


# --- support --------------------------------------------------------------------------


async def test_ticket_conversation_and_privacy(api: AsyncClient, db) -> None:
    customer, other = await make_user(db), await make_user(db)
    agent = await make_user(db, "STAFF")

    opened = await api.post(
        "/api/v1/support/tickets",
        json={
            "subject": "Wrong shade delivered",
            "category": "ORDER",
            "message": "Got 03, ordered 05",
        },
        headers=auth(customer),
    )
    assert opened.status_code == 201
    ticket = opened.json()
    tid = ticket["id"]
    assert ticket["reference"].startswith("T-") and ticket["status"] == "OPEN"

    # Another customer can't see it.
    assert (await api.get(f"/api/v1/support/tickets/{tid}", headers=auth(other))).status_code == 404
    assert (await api.get("/api/v1/support/tickets", headers=auth(other))).json()["total"] == 0

    note = await api.post(
        f"/api/v1/admin/support/tickets/{tid}/messages",
        json={"body": "Batch 0923 had a labelling fault", "internal": True},
        headers=auth(agent),
    )
    assert note.json()["status"] == "OPEN"  # internal notes don't change status
    reply = await api.post(
        f"/api/v1/admin/support/tickets/{tid}/messages",
        json={"body": "Sorry! A replacement ships today."},
        headers=auth(agent),
    )
    staff_view = reply.json()
    assert staff_view["status"] == "AWAITING_CUSTOMER"
    assert staff_view["assigned_to"] == str(agent.id)
    assert len(staff_view["messages"]) == 3

    mine = (await api.get(f"/api/v1/support/tickets/{tid}", headers=auth(customer))).json()
    bodies = [m["body"] for m in mine["messages"]]
    assert "Batch 0923 had a labelling fault" not in bodies  # internal note hidden
    assert len(bodies) == 2

    back = await api.post(
        f"/api/v1/support/tickets/{tid}/messages", json={"body": "Thanks!"}, headers=auth(customer)
    )
    assert back.json()["status"] == "OPEN"
    closed = await api.post(f"/api/v1/support/tickets/{tid}/close", headers=auth(customer))
    assert closed.json()["status"] == "CLOSED"
    late = await api.post(
        f"/api/v1/support/tickets/{tid}/messages", json={"body": "one more"}, headers=auth(customer)
    )
    assert late.status_code == 422


async def test_ticket_order_must_be_the_requesters(api: AsyncClient, db) -> None:
    from tests.factories import checkout_body, make_product

    owner, stranger = await make_user(db), await make_user(db)
    p = await make_product(db)
    order = (
        await api.post("/api/v1/orders", json=checkout_body((p, 1)), headers=auth(owner))
    ).json()["order"]
    res = await api.post(
        "/api/v1/support/tickets",
        json={"subject": "Where is it?", "order_id": order["id"], "message": "?"},
        headers=auth(stranger),
    )
    assert res.status_code == 422


async def test_support_admin_requires_permission(api: AsyncClient, db) -> None:
    customer = await make_user(db)
    res = await api.get("/api/v1/admin/support/tickets", headers=auth(customer))
    assert res.status_code == 403

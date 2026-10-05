"""Super admin: permission matrix, roles, admin users, commission rules,
platform settings that change checkout, audit viewer and system health.

Every /super-admin route is refused to ADMIN — that's the point of the area."""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.core.exceptions import ValidationFailedError
from app.modules.access import repository as access_repo
from app.modules.access import service as access_service
from app.modules.audit.models import AuditLog
from app.modules.catalog.models import Category
from app.modules.notifications.templates import render_override
from app.modules.orders.models import Order
from app.modules.users.models import Permission as PermissionRow
from app.modules.users.models import Role, User, user_roles
from app.shared.enums import Permission
from app.shared.permissions import GRANTABLE, MATRIX, SUPER_ADMIN_ONLY
from tests.factories import auth, checkout_body, make_product, make_user, make_vendor

pytestmark = pytest.mark.db

S = "/api/v1/super-admin"


async def _put_settings(api, root, **changes):
    res = await api.patch(f"{S}/settings", json=changes, headers=auth(root))
    assert res.status_code == 200, res.text
    return res.json()


# --- the matrix is complete and consistent -------------------------------------------


async def test_every_permission_code_is_seeded_and_in_the_matrix(db) -> None:
    seeded = set((await db.scalars(select(PermissionRow.code))).all())
    assert seeded == {p.value for p in Permission}
    in_matrix = {c.value for m in MATRIX for c in m.actions.values()}
    assert in_matrix | {"vendor.portal"} == seeded
    assert not GRANTABLE & SUPER_ADMIN_ONLY


async def test_super_admin_area_is_closed_to_admins(api: AsyncClient, db) -> None:
    admin = await make_user(db, "ADMIN")
    root = await make_user(db, "SUPER_ADMIN")
    for path in (
        "/permissions",
        "/roles",
        "/admins",
        "/commission",
        "/settings",
        "/audit-logs",
        "/system/health",
    ):
        assert (await api.get(S + path, headers=auth(admin))).status_code == 403, path
        assert (await api.get(S + path, headers=auth(root))).status_code == 200, path


async def test_me_reports_effective_permissions(api: AsyncClient, db) -> None:
    staff = await make_user(db, "STAFF")
    root = await make_user(db, "SUPER_ADMIN")
    mine = set((await api.get("/api/v1/auth/me", headers=auth(staff))).json()["permissions"])
    assert "orders.edit" in mine and "products.edit" not in mine and "audit.view" not in mine
    everything = (await api.get("/api/v1/auth/me", headers=auth(root))).json()["permissions"]
    assert set(everything) == {p.value for p in Permission}


# --- roles ---------------------------------------------------------------------------


async def test_custom_role_lifecycle_and_guard_rails(api: AsyncClient, db) -> None:
    root = await make_user(db, "SUPER_ADMIN")
    # Super-admin-only codes can't be granted.
    res = await api.post(
        f"{S}/roles",
        json={"name": "AUDITOR", "permissions": ["audit.view"]},
        headers=auth(root),
    )
    assert res.status_code == 422
    res = await api.post(
        f"{S}/roles",
        json={"name": "CONTENT_EDITOR", "permissions": ["cms.view", "cms.edit"]},
        headers=auth(root),
    )
    assert res.status_code == 201, res.text
    role = res.json()
    assert role["permissions"] == ["cms.edit", "cms.view"] and not role["built_in"]

    res = await api.put(
        f"{S}/roles/{role['id']}",
        json={"permissions": ["cms.view", "cms.create", "support.view"]},
        headers=auth(root),
    )
    assert res.status_code == 200
    entry = await db.scalar(
        select(AuditLog)
        .where(AuditLog.entity_id == role["id"], AuditLog.action == "roles.permissions")
        .order_by(AuditLog.created_at.desc())
    )
    assert entry.changes["granted"] == ["cms.create", "support.view"]
    assert entry.changes["revoked"] == ["cms.edit"]

    # The role works end to end once someone holds it.
    editor = await make_user(db, "CONTENT_EDITOR")
    assert (await api.get("/api/v1/admin/banners", headers=auth(editor))).status_code == 200
    assert (await api.get("/api/v1/admin/orders", headers=auth(editor))).status_code == 403

    # In use → can't delete; locked built-ins can't be edited.
    assert (await api.delete(f"{S}/roles/{role['id']}", headers=auth(root))).status_code == 409
    super_role = await db.scalar(select(Role).where(Role.name == "SUPER_ADMIN"))
    res = await api.put(f"{S}/roles/{super_role.id}", json={"permissions": []}, headers=auth(root))
    assert res.status_code == 422


# --- admin users -------------------------------------------------------------------


async def test_grant_change_and_revoke_admin_access(api: AsyncClient, db) -> None:
    root = await make_user(db, "SUPER_ADMIN")
    person = await make_user(db, email="new-staff@example.com")

    missing = await api.post(
        f"{S}/admins", json={"email": "nobody@example.com", "roles": ["STAFF"]}, headers=auth(root)
    )
    assert missing.status_code == 404
    res = await api.post(
        f"{S}/admins",
        json={"email": "New-Staff@example.com", "roles": ["STAFF"]},
        headers=auth(root),
    )
    assert res.status_code == 201 and res.json()["roles"] == ["STAFF"]
    assert (await api.get("/api/v1/admin/orders", headers=auth(person))).status_code == 200

    res = await api.put(
        f"{S}/admins/{person.id}/roles", json={"roles": ["ADMIN"]}, headers=auth(root)
    )
    assert res.json()["roles"] == ["ADMIN"]
    entry = await db.scalar(
        select(AuditLog)
        .where(AuditLog.entity_id == str(person.id), AuditLog.action == "users.roles")
        .order_by(AuditLog.created_at.desc())
    )
    assert entry.changes["roles"] == [["STAFF"], ["ADMIN"]]

    res = await api.put(f"{S}/admins/{person.id}/roles", json={"roles": []}, headers=auth(root))
    assert res.json()["roles"] == []
    await db.refresh(person)
    assert [r.name for r in person.roles] == ["CUSTOMER"]  # still a shopper


async def test_cannot_lock_out_the_platform(api: AsyncClient, db) -> None:
    root = await make_user(db, "SUPER_ADMIN")
    # Nobody edits their own access.
    res = await api.put(f"{S}/admins/{root.id}/roles", json={"roles": []}, headers=auth(root))
    assert res.status_code == 422
    res = await api.patch(
        f"{S}/admins/{root.id}/status", json={"active": False}, headers=auth(root)
    )
    assert res.status_code == 422

    # With exactly two active super admins, one may deactivate the other…
    other = await make_user(db, "SUPER_ADMIN")
    await db.execute(
        update(User)
        .where(
            User.id.not_in((root.id, other.id)),
            User.id.in_(
                select(user_roles.c.user_id)
                .join(Role, Role.id == user_roles.c.role_id)
                .where(Role.name == "SUPER_ADMIN")
            ),
        )
        .values(is_active=False)
    )
    res = await api.patch(
        f"{S}/admins/{other.id}/status", json={"active": False}, headers=auth(root)
    )
    assert res.status_code == 200
    # …but then `root` is the last one: a third super admin can't demote them.
    third = await make_user(db, "SUPER_ADMIN")
    await db.execute(update(User).where(User.id == third.id).values(is_active=True))
    res = await api.patch(
        f"{S}/admins/{third.id}/status", json={"active": False}, headers=auth(root)
    )
    assert res.status_code == 200
    res = await api.put(
        f"{S}/admins/{root.id}/roles", json={"roles": ["ADMIN"]}, headers=auth(third)
    )
    assert res.status_code == 401  # deactivated accounts can't act at all
    # The guard itself (no active super admin other than root is left to call
    # the API, so exercise the service): root can't be demoted.
    assert await access_repo.active_super_admins(db) == 1
    with pytest.raises(ValidationFailedError, match="at least one active super admin"):
        await access_service.set_admin_roles(db, root.id, ["ADMIN"], me=uuid.uuid4())


# --- commission ----------------------------------------------------------------------


async def test_commission_precedence_vendor_then_category_then_global(api: AsyncClient, db) -> None:
    root = await make_user(db, "SUPER_ADMIN")
    parent = Category(name="Fragrance", slug="fragrance-cm")
    child = Category(name="Attar", slug="attar-cm", parent=parent)
    db.add_all([parent, child])
    await db.flush()
    res = await api.put(
        f"{S}/commission/categories/{parent.id}", json={"rate": "20"}, headers=auth(root)
    )
    assert res.status_code == 200
    rules = res.json()
    attar = next(c for c in rules["categories"] if c["id"] == str(child.id))
    assert attar["rate"] is None and attar["effective_rate"] == "20.00"
    assert attar["inherited_from"] == "Fragrance"

    plain, _ = await make_vendor(db)
    special, _ = await make_vendor(db, commission=Decimal("8.50"))
    in_cat = await make_product(db, vendor=plain, price="1000.00")
    in_cat.category_id = child.id
    no_cat = await make_product(db, vendor=plain, price="1000.00")
    special_p = await make_product(db, vendor=special, price="1000.00")
    special_p.category_id = child.id
    await db.flush()

    customer = await make_user(db)
    res = await api.post(
        "/api/v1/orders",
        json=checkout_body((in_cat, 1), (no_cat, 1), (special_p, 1)),
        headers=auth(customer),
    )
    assert res.status_code == 201, res.text
    order = await db.get(Order, res.json()["order"]["id"])
    await db.refresh(order, ["items", "vendor_orders"])
    rate = {i.product_id: i.commission_rate for i in order.items}
    assert rate[in_cat.id] == Decimal("20.00")  # category, inherited from the parent
    assert rate[no_cat.id] == Decimal("15.00")  # global default
    assert rate[special_p.id] == Decimal("8.50")  # vendor override beats category
    plain_vo = next(v for v in order.vendor_orders if v.vendor_id == plain.id)
    assert plain_vo.commission_amount == Decimal("350.00")  # 200 + 150
    assert plain_vo.commission_rate == Decimal("17.50")  # blended

    # Changing a rule never touches that order.
    await api.put(f"{S}/commission/global", json={"rate": "30"}, headers=auth(root))
    await db.refresh(plain_vo)
    assert plain_vo.commission_amount == Decimal("350.00")


# --- platform settings change checkout ------------------------------------------------


async def test_shipping_zones_tax_mode_and_payment_rules(api: AsyncClient, db) -> None:
    root = await make_user(db, "SUPER_ADMIN")
    customer = await make_user(db)
    product = await make_product(db, price="1000.00")

    await _put_settings(
        api,
        root,
        shipping_zones=[
            {
                "name": "Valley",
                "regions": ["kathmandu", "Lalitpur"],
                "fee": "80",
                "free_threshold": "9000",
            }
        ],
        taxes={"label": "VAT", "prices_include_tax": False},
    )
    res = await api.post("/api/v1/orders", json=checkout_body((product, 1)), headers=auth(customer))
    assert res.status_code == 201, res.text
    order = res.json()["order"]
    assert Decimal(order["shipping_fee"]) == 80  # zone fee for Kathmandu
    assert Decimal(order["total"]) == Decimal("1000") + 80 + Decimal(order["tax_total"])

    await _put_settings(api, root, payments={"enabled_methods": ["COD"], "cod_max_total": "500"})
    res = await api.post("/api/v1/orders", json=checkout_body((product, 1)), headers=auth(customer))
    assert res.status_code == 422 and "Cash on delivery" in res.json()["error"]["message"]
    methods = {m["method"]: m for m in (await api.get("/api/v1/payments/methods")).json()}
    assert methods["COD"]["available"] and not methods["ESEWA"]["available"]

    await _put_settings(api, root, payments={"enabled_methods": ["ESEWA"]})
    res = await api.post("/api/v1/orders", json=checkout_body((product, 1)), headers=auth(customer))
    assert res.status_code == 422

    bad = await api.patch(
        f"{S}/settings",
        json={"shipping_zones": [{"name": "X", "regions": [" "], "fee": "1"}]},
        headers=auth(root),
    )
    assert bad.status_code == 422


def test_email_template_override_fills_and_escapes() -> None:
    subject, text, html = render_override(
        "order.status_changed",
        {
            "order_number": "BC-1",
            "recipient": "<b>Asha</b>",
            "status": "SHIPPED",
            "total": "10",
            "currency": "NPR",
        },
        "{{order_number}} is {{status}}",
        "Hi {{recipient}},\n\n{{status_message}} {{unknown}}",
    )
    assert subject == "BC-1 is Shipped"
    assert text.startswith("Hi <b>Asha</b>,") and "{{unknown}}" in text
    assert "&lt;b&gt;Asha&lt;/b&gt;" in html and "<b>Asha</b>" not in html


# --- audit viewer + health -------------------------------------------------------------


async def test_audit_viewer_filters(api: AsyncClient, db) -> None:
    root = await make_user(db, "SUPER_ADMIN")
    admin = await make_user(db, "ADMIN", email="filter-me@example.com")
    await api.post("/api/v1/admin/brands", json={"name": "Filter Maison"}, headers=auth(admin))
    res = await api.get(
        f"{S}/audit-logs", params={"q": "filter-me", "action": "create"}, headers=auth(root)
    )
    items = res.json()["items"]
    assert items and all(i["actor_email"] == "filter-me@example.com" for i in items)
    assert all(i["action"].endswith(".create") for i in items)
    types = (await api.get(f"{S}/audit-logs/entity-types", headers=auth(root))).json()
    assert "brands" in types


async def test_system_health_reports_every_component(api: AsyncClient, db) -> None:
    root = await make_user(db, "SUPER_ADMIN")
    await api.get("/api/v1/products", headers=auth(root))  # some traffic for the latency stats
    res = await api.get(f"{S}/system/health", headers=auth(root))
    assert res.status_code == 200
    body = res.json()
    assert {c["key"] for c in body["components"]} == {
        "api",
        "postgres",
        "redis",
        "celery",
        "beat",
        "n8n",
    }
    pg = next(c for c in body["components"] if c["key"] == "postgres")
    assert pg["status"] in ("ok", "degraded") and pg["details"]["migration"]
    assert body["api"]["requests"] >= 1

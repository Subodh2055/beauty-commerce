"""Roles → permissions, and the audit trail on admin/vendor changes."""

import pytest
from fastapi.routing import APIRoute
from httpx import AsyncClient
from sqlalchemy import select

from app.main import app
from app.modules.audit.dependencies import audit_context
from app.modules.audit.models import AuditLog
from app.modules.users.models import Permission as PermissionRow
from app.modules.users.models import Role, User
from tests.factories import auth, make_user

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def _routes(routes=None, prefix=""):
    """Walk every APIRoute with its full path. FastAPI >=0.141 keeps included
    routers as lazy wrappers (`original_router` + `include_context.prefix`);
    older versions flatten them, which the first branch covers."""
    for route in app.router.routes if routes is None else routes:
        if isinstance(route, APIRoute):
            yield prefix + route.path, route
        elif hasattr(route, "original_router"):
            sub_prefix = prefix + route.include_context.prefix
            yield from _routes(route.original_router.routes, sub_prefix)


def _calls(dependant):
    yield dependant.call
    for sub in dependant.dependencies:
        yield from _calls(sub)


# --- static guarantees (no DB) -----------------------------------------------------


def test_every_admin_and_vendor_mutation_is_audited_and_permissioned() -> None:
    checked = 0
    for path, route in _routes():
        if not (path.startswith("/api/v1/admin") or path.startswith("/api/v1/vendor/")):
            continue
        calls = list(_calls(route.dependant))
        perms = [getattr(c, "required_permission", None) for c in calls]
        assert any(perms), f"{path} has no require_permission dependency"
        if route.methods & MUTATING:
            assert audit_context in calls, f"{sorted(route.methods)} {path} is not audited"
            checked += 1
    assert checked > 30  # guards against the walker silently finding nothing


def test_permission_check_in_memory() -> None:
    perm = PermissionRow(code="catalog.manage")
    staff = User(email="s@example.com", roles=[Role(name="STAFF", permissions=[])])
    admin = User(email="a@example.com", roles=[Role(name="ADMIN", permissions=[perm])])
    root = User(email="r@example.com", roles=[Role(name="SUPER_ADMIN", permissions=[])])
    assert not staff.has_permission("catalog.manage")
    assert admin.has_permission("catalog.manage")
    # SUPER_ADMIN passes even for permissions it has no row for.
    assert root.has_permission("anything.new")


# --- seeded grants -----------------------------------------------------------------


@pytest.mark.db
async def test_seeded_grants_enforced_over_http(api: AsyncClient, db) -> None:
    staff = await make_user(db, "STAFF")
    admin = await make_user(db, "ADMIN")
    root = await make_user(db, "SUPER_ADMIN")

    # Staff: orders yes, catalog no.
    assert (await api.get("/api/v1/admin/orders", headers=auth(staff))).status_code == 200
    assert (await api.get("/api/v1/admin/products", headers=auth(staff))).status_code == 403
    # Admin: catalog yes, platform settings no (super admin only).
    assert (await api.get("/api/v1/admin/products", headers=auth(admin))).status_code == 200
    assert (await api.get("/api/v1/admin/settings", headers=auth(admin))).status_code == 403
    assert (await api.get("/api/v1/admin/settings", headers=auth(root))).status_code == 200
    # Customers get nothing in /admin.
    customer = await make_user(db)
    assert (await api.get("/api/v1/admin/stats", headers=auth(customer))).status_code == 403


# --- audit trail -------------------------------------------------------------------


@pytest.mark.db
async def test_admin_changes_are_logged_with_a_diff(api: AsyncClient, db) -> None:
    admin = await make_user(db, "ADMIN")
    created = await api.post(
        "/api/v1/admin/brands", json={"name": "Audit Maison"}, headers=auth(admin)
    )
    assert created.status_code == 201
    brand_id = created.json()["id"]
    updated = await api.put(
        f"/api/v1/admin/brands/{brand_id}",
        json={"name": "Audit Maison II", "country": "fr"},
        headers=auth(admin),
    )
    assert updated.status_code == 200

    logs = (
        await db.scalars(
            select(AuditLog).where(AuditLog.entity_id == brand_id).order_by(AuditLog.created_at)
        )
    ).all()
    assert [log.action for log in logs] == ["brands.create", "brands.update"]
    create, update = logs
    assert create.actor_id == admin.id and create.actor_email == admin.email
    assert create.request_method == "POST" and create.request_path == "/api/v1/admin/brands"
    assert create.changes["name"] == "Audit Maison"
    assert update.changes["name"] == ["Audit Maison", "Audit Maison II"]
    assert update.changes["country"] == [None, "FR"]

    # Readable through the API by anyone with audit.read…
    res = await api.get(
        "/api/v1/admin/audit-logs", params={"entity_id": brand_id}, headers=auth(admin)
    )
    assert res.status_code == 200 and res.json()["total"] == 2
    # …but not by staff.
    staff = await make_user(db, "STAFF")
    assert (await api.get("/api/v1/admin/audit-logs", headers=auth(staff))).status_code == 403


@pytest.mark.db
async def test_rejected_and_customer_actions_write_no_audit(api: AsyncClient, db) -> None:
    admin = await make_user(db, "ADMIN")
    before = len((await db.scalars(select(AuditLog))).all())

    # Validation failure: nothing changed, nothing logged.
    bad = await api.post("/api/v1/admin/brands", json={"name": ""}, headers=auth(admin))
    assert bad.status_code == 422
    # Customer actions aren't admin actions.
    customer = await make_user(db)
    address = {
        "recipient_name": "A",
        "phone": "98000000",
        "line1": "x",
        "city": "Kathmandu",
    }
    ok = await api.post("/api/v1/users/me/addresses", json=address, headers=auth(customer))
    assert ok.status_code == 201

    assert len((await db.scalars(select(AuditLog))).all()) == before


@pytest.mark.db
async def test_sensitive_columns_are_redacted(db) -> None:
    from app.modules.audit import service as audit_service
    from app.modules.audit.schemas import AuditContext

    actor = await make_user(db, "ADMIN")
    target = await make_user(db)
    audit_service.bind(db, AuditContext(actor.id, actor.email, "PATCH", "/test", None, None))
    target.hashed_password = "argon2-secret"
    await db.flush()
    db.info.pop("audit_context")

    log = await db.scalar(
        select(AuditLog).where(
            AuditLog.entity_id == str(target.id), AuditLog.action == "users.update"
        )
    )
    assert log is not None
    assert log.changes["hashed_password"] == ["[redacted]", "[redacted]"]

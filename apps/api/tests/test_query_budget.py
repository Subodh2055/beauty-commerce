"""N+1 guard: the number of SQL statements a list endpoint runs must not grow
with the number of rows it returns.

Each endpoint is called, more rows are added, and it is called again; the
statement count may not go up (pagination keeps the page size fixed)."""

from contextlib import contextmanager
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.engine import Engine

from app.modules.orders.models import Order
from app.modules.support.models import SupportTicket, TicketMessage
from app.modules.wishlist.models import WishlistItem
from tests.factories import (
    auth,
    checkout_body,
    make_family,
    make_note,
    make_product,
    make_user,
    make_vendor,
)

pytestmark = pytest.mark.db


@contextmanager
def counting():
    stmts: list[str] = []

    def before(_conn, _cursor, statement, *_args):
        if not statement.lstrip().upper().startswith(("SAVEPOINT", "RELEASE", "ROLLBACK")):
            stmts.append(statement)

    event.listen(Engine, "before_cursor_execute", before)
    try:
        yield stmts
    finally:
        event.remove(Engine, "before_cursor_execute", before)


async def _count(api: AsyncClient, path: str, headers=None) -> int:
    with counting() as stmts:
        res = await api.get(path, headers=headers)
    assert res.status_code == 200, (path, res.text)
    return len(stmts)


async def _grow(db, api, customer, vendor, family, note, n: int) -> None:
    for i in range(n):
        p = await make_product(db, vendor=vendor, family=family, notes=[(note, "TOP")], stock=50)
        await make_product(db)  # platform-owned
        res = await api.post("/api/v1/orders", json=checkout_body((p, 1)), headers=auth(customer))
        assert res.status_code == 201, res.text
        order = await db.get(Order, res.json()["order"]["id"])
        db.add(WishlistItem(user_id=customer.id, product_id=p.id, created_at=datetime.now(UTC)))
        ticket = SupportTicket(
            reference=f"T-QB-{i}-{p.sku[-6:]}",
            requester_id=customer.id,
            order_id=order.id,
            subject="Where is it?",
            category="ORDER",
        )
        ticket.messages = [
            TicketMessage(from_staff=False, body="Hello", created_at=datetime.now(UTC))
        ]
        db.add(ticket)
        await make_user(db)
    await db.flush()


async def test_list_endpoints_do_not_grow_queries_with_rows(api: AsyncClient, db) -> None:
    root = await make_user(db, "SUPER_ADMIN")
    customer = await make_user(db)
    vendor, owner = await make_vendor(db)
    family = await make_family(db, "Budget")
    note = await make_note(db, "Budget Note")
    await _grow(db, api, customer, vendor, family, note, 2)

    endpoints = [
        ("/api/v1/products?size=24", None),
        ("/api/v1/products?size=24&sort=bestselling", None),
        ("/api/v1/admin/orders?size=50", auth(root)),
        ("/api/v1/admin/products?size=50", auth(root)),
        ("/api/v1/admin/customers?size=50", auth(root)),
        ("/api/v1/admin/vendors?size=50", auth(root)),
        ("/api/v1/admin/support/tickets?size=50", auth(root)),
        ("/api/v1/admin/returns?size=50", auth(root)),
        ("/api/v1/super-admin/audit-logs?size=50", auth(root)),
        ("/api/v1/super-admin/admins", auth(root)),
        ("/api/v1/orders?size=50", auth(customer)),
        ("/api/v1/users/me/wishlist", auth(customer)),
        ("/api/v1/vendor/orders?size=50", auth(owner)),
        ("/api/v1/vendor/products?size=50", auth(owner)),
        ("/api/v1/vendor/inventory?size=50", auth(owner)),
    ]
    before = {path: await _count(api, path, h) for path, h in endpoints}
    await _grow(db, api, customer, vendor, family, note, 6)
    after = {path: await _count(api, path, h) for path, h in endpoints}
    grew = {p: (before[p], after[p]) for p in before if after[p] > before[p]}
    assert not grew, f"statement count grows with rows (N+1): {grew}"

"""Builders for DB-backed tests. Everything is flushed into the test's
rolled-back session, so ids are real but nothing outlives the test."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_token
from app.modules.catalog.models import (
    FragranceFamily,
    FragranceNote,
    Product,
    ProductNote,
    ProductVariant,
)
from app.modules.users.models import Role, User
from app.modules.vendors.models import Vendor
from app.shared.enums import ProductStatus, VendorStatus


def _uid() -> str:
    return uuid.uuid4().hex[:10]


async def make_user(db: AsyncSession, *roles: str, email: str | None = None) -> User:
    role_rows = list(await db.scalars(select(Role).where(Role.name.in_(roles or ("CUSTOMER",)))))
    user = User(email=email or f"u-{_uid()}@example.com", full_name="Test User", roles=role_rows)
    db.add(user)
    await db.flush()
    return user


def auth(user: User) -> dict[str, str]:
    token = create_token(
        str(user.id),
        "access",
        {
            "roles": [r.name for r in user.roles],
            "sid": "test",
            "sst": int(datetime.now(UTC).timestamp()),
        },
    )
    return {"Authorization": f"Bearer {token}"}


async def make_vendor(
    db: AsyncSession,
    *,
    status: str = VendorStatus.APPROVED,
    commission: Decimal | None = None,
    owner: User | None = None,
) -> tuple[Vendor, User]:
    """A vendor plus its owner (with the VENDOR role when approved/suspended)."""
    if owner is None:
        roles = ("CUSTOMER", "VENDOR") if status != VendorStatus.PENDING else ("CUSTOMER",)
        owner = await make_user(db, *roles)
    suffix = _uid()
    vendor = Vendor(
        owner_id=owner.id,
        name=f"Store {suffix}",
        slug=f"store-{suffix}",
        contact_email=owner.email,
        status=status,
        commission_rate=commission,
    )
    db.add(vendor)
    await db.flush()
    return vendor, owner


async def make_product(
    db: AsyncSession,
    *,
    vendor: Vendor | None = None,
    status: str = ProductStatus.PUBLISHED,
    price: str = "1000.00",
    stock: int = 10,
    name: str | None = None,
    gender: str | None = None,
    family: FragranceFamily | None = None,
    notes: list[tuple[FragranceNote, str]] = (),
) -> Product:
    suffix = _uid()
    product = Product(
        sku=f"SKU-{suffix}",
        name=name or f"Product {suffix}",
        slug=f"product-{suffix}",
        product_type="perfume",
        base_price=Decimal(price),
        status=status,
        vendor_id=vendor.id if vendor else None,
        gender=gender,
        fragrance_family_id=family.id if family else None,
        published_at=datetime.now(UTC) if status == ProductStatus.PUBLISHED else None,
        attributes={},
        tags=[],
        images=[],
        variants=[
            ProductVariant(
                sku=f"VAR-{suffix}",
                name="50 ml",
                size_ml=Decimal("50"),
                price=Decimal(price),
                stock_quantity=stock,
                is_default=True,
            )
        ],
        notes=[
            ProductNote(note_id=n.id, position=pos, sort_order=i)
            for i, (n, pos) in enumerate(notes)
        ],
    )
    db.add(product)
    await db.flush()
    return product


async def make_family(db: AsyncSession, name: str) -> FragranceFamily:
    fam = FragranceFamily(name=name, slug=f"{name.lower()}-{_uid()}")
    db.add(fam)
    await db.flush()
    return fam


async def make_note(db: AsyncSession, name: str) -> FragranceNote:
    note = FragranceNote(name=name, slug=f"{name.lower()}-{_uid()}")
    db.add(note)
    await db.flush()
    return note


ADDRESS = {
    "recipient_name": "Asha Shrestha",
    "phone": "9800000000",
    "line1": "Durbar Marg 1",
    "city": "Kathmandu",
    "country": "NP",
}


def checkout_body(*lines: tuple[Product, int], method: str = "COD") -> dict:
    return {
        "items": [{"variant_id": str(p.variants[0].id), "quantity": q} for p, q in lines],
        "shipping_address": ADDRESS,
        "payment_method": method,
    }

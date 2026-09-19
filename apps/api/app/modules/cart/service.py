"""Server-side cart for signed-in users.

Always re-prices from the live catalogue (never stores prices), clamps quantities
to available stock, and drops lines whose variant/product has gone away or been
unpublished. `merge` folds a guest's local cart into the account on login.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.cart.models import CartItem
from app.modules.cart.schemas import CartItemIn, CartLineOut, CartOut
from app.modules.catalog.models import Product, ProductVariant
from app.shared.enums import ProductStatus

Q = Decimal("0.01")


async def _load_lines(db: AsyncSession, user_id: uuid.UUID) -> list[CartItem]:
    stmt = select(CartItem).where(CartItem.user_id == user_id).order_by(CartItem.added_at.desc())
    return list((await db.scalars(stmt)).all())


async def _variants(
    db: AsyncSession, variant_ids: list[uuid.UUID]
) -> dict[uuid.UUID, ProductVariant]:
    if not variant_ids:
        return {}
    stmt = (
        select(ProductVariant)
        .where(ProductVariant.id.in_(variant_ids))
        .options(selectinload(ProductVariant.product).selectinload(Product.images))
    )
    rows = (await db.scalars(stmt)).all()
    return {v.id: v for v in rows}


async def get_cart(db: AsyncSession, user_id: uuid.UUID) -> CartOut:
    lines = await _load_lines(db, user_id)
    variants = await _variants(db, [ln.variant_id for ln in lines])

    items: list[CartLineOut] = []
    subtotal = Decimal("0")
    stale: list[uuid.UUID] = []

    for ln in lines:
        v = variants.get(ln.variant_id)
        p = v.product if v else None
        if v is None or p is None or p.status != ProductStatus.PUBLISHED:
            stale.append(ln.variant_id)
            continue
        # Clamp to stock; drop if nothing available.
        qty = min(ln.quantity, v.stock_quantity)
        if qty <= 0:
            continue
        if qty != ln.quantity:
            ln.quantity = qty  # persist the clamp
        unit = Decimal(v.price)
        line_total = (unit * qty).quantize(Q)
        subtotal += line_total
        primary = next((i for i in p.images if i.is_primary), None) or (
            p.images[0] if p.images else None
        )
        items.append(
            CartLineOut(
                variant_id=v.id,
                product_id=p.id,
                slug=p.slug,
                name=p.name,
                brand=p.brand.name if p.brand else None,
                variant_name=v.name,
                unit_price=unit,
                currency=p.currency,
                image_url=primary.url if primary else None,
                quantity=qty,
                stock_quantity=v.stock_quantity,
                in_stock=v.stock_quantity > 0,
                line_total=line_total,
            )
        )

    # Clean up lines that reference gone/unpublished variants.
    if stale:
        await db.execute(
            delete(CartItem).where(CartItem.user_id == user_id, CartItem.variant_id.in_(stale))
        )
    await db.commit()

    return CartOut(
        items=items,
        count=sum(i.quantity for i in items),
        subtotal=subtotal.quantize(Q),
        currency=items[0].currency if items else "NPR",
    )


async def _get_line(db: AsyncSession, user_id: uuid.UUID, variant_id: uuid.UUID) -> CartItem | None:
    return await db.scalar(
        select(CartItem).where(CartItem.user_id == user_id, CartItem.variant_id == variant_id)
    )


async def add(db: AsyncSession, user_id: uuid.UUID, variant_id: uuid.UUID, qty: int) -> CartOut:
    variant = await db.get(ProductVariant, variant_id)
    if variant is not None:
        line = await _get_line(db, user_id, variant_id)
        target = (line.quantity if line else 0) + qty
        target = max(1, min(target, variant.stock_quantity, 99))
        if line:
            line.quantity = target
        else:
            db.add(
                CartItem(
                    user_id=user_id,
                    variant_id=variant_id,
                    quantity=target,
                    added_at=datetime.now(UTC),
                )
            )
        await db.commit()
    return await get_cart(db, user_id)


async def set_quantity(
    db: AsyncSession, user_id: uuid.UUID, variant_id: uuid.UUID, qty: int
) -> CartOut:
    line = await _get_line(db, user_id, variant_id)
    if line is not None:
        if qty <= 0:
            await db.delete(line)
        else:
            variant = await db.get(ProductVariant, variant_id)
            cap = variant.stock_quantity if variant else qty
            line.quantity = max(1, min(qty, cap, 99))
        await db.commit()
    return await get_cart(db, user_id)


async def remove(db: AsyncSession, user_id: uuid.UUID, variant_id: uuid.UUID) -> CartOut:
    await db.execute(
        delete(CartItem).where(CartItem.user_id == user_id, CartItem.variant_id == variant_id)
    )
    await db.commit()
    return await get_cart(db, user_id)


async def clear(db: AsyncSession, user_id: uuid.UUID) -> CartOut:
    await db.execute(delete(CartItem).where(CartItem.user_id == user_id))
    await db.commit()
    return await get_cart(db, user_id)


async def merge(db: AsyncSession, user_id: uuid.UUID, items: list[CartItemIn]) -> CartOut:
    if items:
        wanted: dict[uuid.UUID, int] = {}
        for it in items:
            wanted[it.variant_id] = wanted.get(it.variant_id, 0) + it.quantity

        variants = await _variants(db, list(wanted))
        existing = {ln.variant_id: ln for ln in await _load_lines(db, user_id)}
        now = datetime.now(UTC)
        for vid, qty in wanted.items():
            v = variants.get(vid)
            if v is None:
                continue
            line = existing.get(vid)
            # On merge, take the larger of the two quantities (don't double-count
            # what may already be synced), clamped to stock.
            target = max(qty, line.quantity if line else 0)
            target = max(1, min(target, v.stock_quantity, 99))
            if target <= 0:
                continue
            if line:
                line.quantity = target
            else:
                db.add(CartItem(user_id=user_id, variant_id=vid, quantity=target, added_at=now))
        await db.commit()
    return await get_cart(db, user_id)

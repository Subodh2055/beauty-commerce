"""Inventory ledger helpers.

`record` writes one ledger row; callers mutate `variant.stock_quantity` and own
the transaction. `adjust` is the admin entry point that does both at once.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.catalog.models import ProductVariant
from app.modules.inventory.models import InventoryTransaction
from app.shared.enums import InventoryReason


def record(
    db: AsyncSession,
    variant: ProductVariant,
    delta: int,
    reason: InventoryReason,
    *,
    order_id: uuid.UUID | None = None,
    note: str | None = None,
    created_by: uuid.UUID | None = None,
) -> None:
    db.add(
        InventoryTransaction(
            variant_id=variant.id,
            delta=delta,
            balance_after=variant.stock_quantity,
            reason=reason,
            order_id=order_id,
            note=note,
            created_by=created_by,
            created_at=datetime.now(UTC),
        )
    )


async def adjust(
    db: AsyncSession, variant_id: uuid.UUID, delta: int, note: str | None, admin_id: uuid.UUID
) -> ProductVariant:
    variant = await db.get(ProductVariant, variant_id, with_for_update=True)
    if variant is None:
        raise NotFoundError("Variant not found")
    if variant.stock_quantity + delta < 0:
        raise ConflictError("Adjustment would make stock negative")
    variant.stock_quantity += delta
    record(db, variant, delta, InventoryReason.ADJUST, note=note, created_by=admin_id)
    await db.commit()
    await db.refresh(variant)
    return variant

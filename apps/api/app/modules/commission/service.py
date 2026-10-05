"""Commission rules: global default, per category, per vendor.

`line_rate` is what checkout uses for each line, so the precedence lives in one
place. Changing a rule affects orders placed afterwards only — every vendor
sub-order and order line keeps the rate it was sold at.
"""

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.catalog.models import Category
from app.modules.commission import repository as repo
from app.modules.commission.schemas import CategoryRule, CommissionRules, VendorRule
from app.modules.settings import service as settings_service
from app.modules.settings.schemas import PlatformSettingsUpdate
from app.modules.vendors.models import Vendor

CategoryTree = dict[uuid.UUID, tuple[uuid.UUID | None, Decimal | None]]


def category_rate(
    tree: CategoryTree, category_id: uuid.UUID | None
) -> tuple[Decimal | None, uuid.UUID | None]:
    """Nearest rate walking up from `category_id`, and the category it came from."""
    seen: set[uuid.UUID] = set()
    current = category_id
    while current is not None and current not in seen and current in tree:
        seen.add(current)
        parent, rate = tree[current]
        if rate is not None:
            return rate, current
        current = parent
    return None, None


def line_rate(
    vendor: Vendor | None,
    category_id: uuid.UUID | None,
    tree: CategoryTree,
    global_rate: Decimal,
) -> Decimal | None:
    """Commission percent for one line; None when the platform sells it itself."""
    if vendor is None:
        return None
    if vendor.commission_rate is not None:
        return Decimal(vendor.commission_rate)
    rate, _ = category_rate(tree, category_id)
    return Decimal(rate) if rate is not None else Decimal(global_rate)


async def rules(db: AsyncSession) -> CommissionRules:
    global_rate = (await settings_service.get_settings(db)).default_commission_rate
    tree = await repo.category_tree(db)
    cats = await repo.categories(db)
    names = {c.id: c.name for c, _ in cats}

    def depth(cid: uuid.UUID) -> int:
        d, parent, seen = 0, tree[cid][0], {cid}
        while parent is not None and parent not in seen and parent in tree:
            seen.add(parent)
            d, parent = d + 1, tree[parent][0]
        return d

    # Parents before children, each subtree in sort order.
    children: dict[uuid.UUID | None, list[tuple[Category, int]]] = {}
    for c, n in cats:
        children.setdefault(c.parent_id if c.parent_id in tree else None, []).append((c, n))
    ordered: list[tuple[Category, int]] = []

    def walk(parent: uuid.UUID | None) -> None:
        for c, n in children.get(parent, []):
            ordered.append((c, n))
            walk(c.id)

    walk(None)
    out = []
    for c, n in ordered:
        rate, source = category_rate(tree, c.id)
        out.append(
            CategoryRule(
                id=c.id,
                name=c.name,
                parent_id=c.parent_id,
                depth=depth(c.id),
                rate=c.commission_rate,
                effective_rate=rate if rate is not None else global_rate,
                inherited_from=names.get(source) if source and source != c.id else None,
                product_count=n,
            )
        )
    return CommissionRules(
        global_rate=global_rate,
        categories=out,
        vendors=[
            VendorRule(id=v.id, name=v.name, status=v.status, rate=v.commission_rate)
            for v in await repo.vendors(db)
        ],
    )


async def set_global(db: AsyncSession, rate: Decimal) -> CommissionRules:
    await settings_service.update_settings(db, PlatformSettingsUpdate(default_commission_rate=rate))
    return await rules(db)


async def set_category(
    db: AsyncSession, category_id: uuid.UUID, rate: Decimal | None
) -> CommissionRules:
    category = await db.get(Category, category_id)
    if category is None:
        raise NotFoundError("Category not found")
    category.commission_rate = rate
    await db.commit()
    return await rules(db)


async def set_vendor(
    db: AsyncSession, vendor_id: uuid.UUID, rate: Decimal | None
) -> CommissionRules:
    vendor = await db.get(Vendor, vendor_id)
    if vendor is None:
        raise NotFoundError("Vendor not found")
    vendor.commission_rate = rate
    await db.commit()
    return await rules(db)

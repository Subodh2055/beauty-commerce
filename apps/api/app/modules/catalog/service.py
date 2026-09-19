from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.catalog import repository as repo
from app.modules.catalog.models import Category, Product
from app.modules.catalog.schemas import (
    BrandOut,
    CategoryOut,
    CategoryTree,
    ProductDetail,
    ProductFacets,
    ProductFilters,
    ProductSummary,
)
from app.shared.pagination import Page, PageParams


def _primary_image(p: Product):
    if not p.images:
        return None
    return next((i for i in p.images if i.is_primary), p.images[0])


def to_summary(p: Product) -> ProductSummary:
    return ProductSummary(
        id=p.id,
        sku=p.sku,
        name=p.name,
        slug=p.slug,
        short_description=p.short_description,
        product_type=p.product_type,
        base_price=p.base_price,
        compare_at_price=p.compare_at_price,
        currency=p.currency,
        is_featured=p.is_featured,
        rating_avg=p.rating_avg,
        rating_count=p.rating_count,
        brand=BrandOut.model_validate(p.brand) if p.brand else None,
        category=CategoryOut.model_validate(p.category) if p.category else None,
        primary_image=_primary_image(p),
        in_stock=any(v.stock_quantity > 0 for v in p.variants),
        tags=list(p.tags or []),
    )


def to_detail(p: Product) -> ProductDetail:
    summary = to_summary(p)
    return ProductDetail(
        **summary.model_dump(),
        description=p.description,
        tax_rate=p.tax_rate,
        attributes=dict(p.attributes or {}),
        images=p.images,
        variants=p.variants,
        published_at=p.published_at,
    )


async def _resolve_category(db: AsyncSession, slug: str | None):
    if not slug:
        return None
    ids = await repo.category_ids_in_subtree(db, slug)
    if ids is None:
        raise NotFoundError(f"Category '{slug}' not found")
    return ids


async def list_products(
    db: AsyncSession, f: ProductFilters, page: PageParams
) -> Page[ProductSummary]:
    category_ids = await _resolve_category(db, f.category)
    rows, total = await repo.list_products(db, f, category_ids, page.offset, page.size)
    return Page(items=[to_summary(p) for p in rows], total=total, page=page.page, size=page.size)


async def product_facets(db: AsyncSession, f: ProductFilters) -> ProductFacets:
    category_ids = await _resolve_category(db, f.category)
    return ProductFacets(**await repo.facets(db, f, category_ids))


async def get_product(db: AsyncSession, slug: str) -> ProductDetail:
    p = await repo.get_product_by_slug(db, slug)
    if p is None:
        raise NotFoundError(f"Product '{slug}' not found")
    return to_detail(p)


async def related_products(db: AsyncSession, slug: str) -> list[ProductSummary]:
    p = await repo.get_product_by_slug(db, slug)
    if p is None:
        raise NotFoundError(f"Product '{slug}' not found")
    return [to_summary(r) for r in await repo.related_products(db, p)]


def _tree_node(c: Category) -> CategoryTree:
    # Build from scalar columns only. model_validate(c) would read the lazy
    # `children` relationship and trigger an async lazy-load outside the greenlet.
    return CategoryTree(
        id=c.id,
        name=c.name,
        slug=c.slug,
        description=c.description,
        image_url=c.image_url,
        parent_id=c.parent_id,
        sort_order=c.sort_order,
        children=[],
    )


def _build_tree(categories: list[Category]) -> list[CategoryTree]:
    nodes = {c.id: _tree_node(c) for c in categories}
    roots: list[CategoryTree] = []
    for c in categories:
        node = nodes[c.id]
        if c.parent_id and c.parent_id in nodes:
            nodes[c.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


async def category_tree(db: AsyncSession) -> list[CategoryTree]:
    return _build_tree(await repo.list_categories(db))


async def get_category(db: AsyncSession, slug: str) -> CategoryOut:
    c = await repo.get_category_by_slug(db, slug)
    if c is None:
        raise NotFoundError(f"Category '{slug}' not found")
    return CategoryOut.model_validate(c)


async def list_brands(db: AsyncSession) -> list[BrandOut]:
    return [BrandOut.model_validate(b) for b in await repo.list_brands(db)]


async def get_brand(db: AsyncSession, slug: str) -> BrandOut:
    b = await repo.get_brand_by_slug(db, slug)
    if b is None:
        raise NotFoundError(f"Brand '{slug}' not found")
    return BrandOut.model_validate(b)

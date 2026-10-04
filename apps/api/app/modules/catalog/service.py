import re
import uuid
from datetime import UTC, datetime

from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.core.exceptions import ConflictError, NotFoundError, ValidationFailedError
from app.modules.catalog import repository as repo
from app.modules.catalog.models import (
    Brand,
    Category,
    FragranceFamily,
    FragranceNote,
    Product,
    ProductImage,
    ProductNote,
    ProductVariant,
)
from app.modules.catalog.schemas import (
    BrandOut,
    CategoryOut,
    CategoryTree,
    FamilyWriteIn,
    FragranceFamilyOut,
    FragranceNoteOut,
    NotePyramid,
    NoteWriteBody,
    ProductDetail,
    ProductFacets,
    ProductFilters,
    ProductSummary,
    ProductWriteBase,
    VendorRef,
)
from app.shared.enums import NotePosition, ProductStatus
from app.shared.pagination import Page, PageParams

CACHE_NS = "catalog"


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
        vendor=VendorRef.model_validate(p.vendor) if p.vendor else None,
        gender=p.gender,
        fragrance_family=(
            FragranceFamilyOut.model_validate(p.fragrance_family) if p.fragrance_family else None
        ),
        primary_image=_primary_image(p),
        in_stock=any(v.stock_quantity > 0 for v in p.variants),
        tags=list(p.tags or []),
    )


def _pyramid(p: Product) -> NotePyramid:
    pyramid = NotePyramid()
    buckets = {
        NotePosition.TOP: pyramid.top,
        NotePosition.HEART: pyramid.heart,
        NotePosition.BASE: pyramid.base,
    }
    for pn in p.notes:  # already ordered by sort_order
        buckets[NotePosition(pn.position)].append(FragranceNoteOut.model_validate(pn.note))
    return pyramid


def to_detail(p: Product) -> ProductDetail:
    summary = to_summary(p)
    return ProductDetail(
        **summary.model_dump(),
        description=p.description,
        tax_rate=p.tax_rate,
        attributes=dict(p.attributes or {}),
        notes=_pyramid(p),
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


# --- Public reads (cached; see catalog/cache.py for invalidation) -------------

_PAGE = TypeAdapter(Page[ProductSummary])
_FACETS = TypeAdapter(ProductFacets)
_DETAIL = TypeAdapter(ProductDetail | None)
_SUMMARIES = TypeAdapter(list[ProductSummary] | None)
_TREE = TypeAdapter(list[CategoryTree])
_CATEGORY = TypeAdapter(CategoryOut | None)
_BRANDS = TypeAdapter(list[BrandOut])
_BRAND = TypeAdapter(BrandOut | None)
_FAMILIES = TypeAdapter(list[FragranceFamilyOut])
_NOTES = TypeAdapter(list[FragranceNoteOut])


async def list_products(
    db: AsyncSession, f: ProductFilters, page: PageParams
) -> Page[ProductSummary]:
    async def load() -> Page[ProductSummary]:
        category_ids = await _resolve_category(db, f.category)
        rows, total = await repo.list_products(db, f, category_ids, page.offset, page.size)
        return Page(
            items=[to_summary(p) for p in rows], total=total, page=page.page, size=page.size
        )

    key = cache.make_key("products", f.model_dump_json(), page.page, page.size)
    return await cache.get_or_load(CACHE_NS, key, _PAGE, load)


async def product_facets(db: AsyncSession, f: ProductFilters) -> ProductFacets:
    async def load() -> ProductFacets:
        category_ids = await _resolve_category(db, f.category)
        return ProductFacets(**await repo.facets(db, f, category_ids))

    key = cache.make_key("facets", f.model_dump_json())
    return await cache.get_or_load(CACHE_NS, key, _FACETS, load)


async def get_product(db: AsyncSession, slug: str) -> ProductDetail:
    async def load() -> ProductDetail | None:
        p = await repo.get_product_by_slug(db, slug)
        return to_detail(p) if p else None

    # Misses are cached too (as null) so a crawler hammering dead slugs stays cheap.
    detail = await cache.get_or_load(CACHE_NS, cache.make_key("product", slug), _DETAIL, load)
    if detail is None:
        raise NotFoundError(f"Product '{slug}' not found")
    return detail


async def related_products(db: AsyncSession, slug: str) -> list[ProductSummary]:
    async def load() -> list[ProductSummary] | None:
        p = await repo.get_product_by_slug(db, slug)
        return [to_summary(r) for r in await repo.related_products(db, p)] if p else None

    rows = await cache.get_or_load(CACHE_NS, cache.make_key("related", slug), _SUMMARIES, load)
    if rows is None:
        raise NotFoundError(f"Product '{slug}' not found")
    return rows


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
    async def load() -> list[CategoryTree]:
        return _build_tree(await repo.list_categories(db))

    return await cache.get_or_load(CACHE_NS, "category-tree", _TREE, load)


async def get_category(db: AsyncSession, slug: str) -> CategoryOut:
    async def load() -> CategoryOut | None:
        c = await repo.get_category_by_slug(db, slug)
        return CategoryOut.model_validate(c) if c else None

    c = await cache.get_or_load(CACHE_NS, cache.make_key("category", slug), _CATEGORY, load)
    if c is None:
        raise NotFoundError(f"Category '{slug}' not found")
    return c


async def list_brands(db: AsyncSession) -> list[BrandOut]:
    async def load() -> list[BrandOut]:
        return [BrandOut.model_validate(b) for b in await repo.list_brands(db)]

    return await cache.get_or_load(CACHE_NS, "brands", _BRANDS, load)


async def get_brand(db: AsyncSession, slug: str) -> BrandOut:
    async def load() -> BrandOut | None:
        b = await repo.get_brand_by_slug(db, slug)
        return BrandOut.model_validate(b) if b else None

    b = await cache.get_or_load(CACHE_NS, cache.make_key("brand", slug), _BRAND, load)
    if b is None:
        raise NotFoundError(f"Brand '{slug}' not found")
    return b


async def list_families(db: AsyncSession) -> list[FragranceFamilyOut]:
    async def load() -> list[FragranceFamilyOut]:
        return [FragranceFamilyOut.model_validate(f) for f in await repo.list_families(db)]

    return await cache.get_or_load(CACHE_NS, "families", _FAMILIES, load)


async def list_notes(db: AsyncSession, family: str | None) -> list[FragranceNoteOut]:
    async def load() -> list[FragranceNoteOut]:
        return [FragranceNoteOut.model_validate(n) for n in await repo.list_notes(db, family)]

    return await cache.get_or_load(CACHE_NS, cache.make_key("notes", family), _NOTES, load)


# --- Product writes (admin + vendor portal) -----------------------------------


def slugify(text: str, fallback: str = "product") -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or fallback


async def unique_slug(db: AsyncSession, model, slug: str, exclude_id: uuid.UUID | None) -> str:
    """Ensure `slug` is unique for `model`, appending -2, -3… if needed."""
    base = slug
    n = 1
    while True:
        stmt = select(model.id).where(model.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(model.id != exclude_id)
        if await db.scalar(stmt) is None:
            return slug
        n += 1
        slug = f"{base}-{n}"


async def _assert_skus_free(db: AsyncSession, body: ProductWriteBase, product_id) -> None:
    stmt = select(Product.id).where(Product.sku == body.sku)
    if product_id is not None:
        stmt = stmt.where(Product.id != product_id)
    if await db.scalar(stmt):
        raise ConflictError("A product with this SKU already exists")
    variant_skus = [v.sku for v in body.variants if v.sku]
    if len(variant_skus) != len(set(variant_skus)):
        raise ValidationFailedError("Variant SKUs must be unique")
    if variant_skus:
        stmt = select(ProductVariant.sku).where(ProductVariant.sku.in_(variant_skus))
        if product_id is not None:
            stmt = stmt.where(ProductVariant.product_id != product_id)
        taken = list(await db.scalars(stmt))
        if taken:
            raise ConflictError(f"Variant SKU already in use: {', '.join(taken)}")


async def _validate_refs(db: AsyncSession, body: ProductWriteBase) -> None:
    if body.brand_id and not await db.get(Brand, body.brand_id):
        raise ValidationFailedError("Brand not found")
    if body.category_id and not await db.get(Category, body.category_id):
        raise ValidationFailedError("Category not found")
    if body.fragrance_family_id and not await db.get(FragranceFamily, body.fragrance_family_id):
        raise ValidationFailedError("Fragrance family not found")
    note_ids = {n.note_id for n in body.notes}
    if note_ids:
        found = set(
            await db.scalars(select(FragranceNote.id).where(FragranceNote.id.in_(note_ids)))
        )
        if missing := note_ids - found:
            raise ValidationFailedError(f"Fragrance note not found: {', '.join(map(str, missing))}")


def _reconcile_variants(product: Product, body: ProductWriteBase) -> None:
    """Update existing variants by id, add new ones, drop removed ones.
    Preserves variant ids so the inventory ledger and order history stay linked."""
    existing = {v.id: v for v in product.variants}
    by_sku = {v.sku: v for v in product.variants}
    seen: set[uuid.UUID] = set()
    default_set = False

    for i, vin in enumerate(body.variants):
        is_default = vin.is_default and not default_set
        if is_default:
            default_set = True
        sku = vin.sku or f"{body.sku}-{i + 1}"
        # A client that omits the id but keeps the SKU means the same variant;
        # inserting a twin would collide on the unique SKU before the old row
        # is deleted, and would orphan its inventory/order history.
        match = existing.get(vin.id) if vin.id else None
        if match is None and sku in by_sku and by_sku[sku].id not in seen:
            match = by_sku[sku]
        if match is not None:
            v = match
            v.name, v.sku, v.options, v.size_ml = vin.name, sku, vin.options, vin.size_ml
            v.price, v.compare_at_price = vin.price, vin.compare_at_price
            v.stock_quantity, v.is_default, v.sort_order = (
                vin.stock_quantity,
                is_default,
                vin.sort_order,
            )
            seen.add(v.id)
        else:
            product.variants.append(
                ProductVariant(
                    name=vin.name,
                    sku=sku,
                    options=vin.options,
                    size_ml=vin.size_ml,
                    price=vin.price,
                    compare_at_price=vin.compare_at_price,
                    stock_quantity=vin.stock_quantity,
                    is_default=is_default,
                    sort_order=vin.sort_order,
                )
            )
    # Ensure exactly one default.
    if not default_set and product.variants:
        product.variants[0].is_default = True
    for vid, v in existing.items():
        if vid not in seen:
            product.variants.remove(v)


def _reconcile_images(product: Product, body: ProductWriteBase) -> None:
    existing = {img.id: img for img in product.images}
    seen: set[uuid.UUID] = set()
    primary_set = False
    for iin in body.images:
        is_primary = iin.is_primary and not primary_set
        if is_primary:
            primary_set = True
        if iin.id and iin.id in existing:
            img = existing[iin.id]
            img.url, img.alt, img.is_primary, img.sort_order = (
                iin.url,
                iin.alt,
                is_primary,
                iin.sort_order,
            )
            seen.add(iin.id)
        else:
            product.images.append(
                ProductImage(
                    url=iin.url, alt=iin.alt, is_primary=is_primary, sort_order=iin.sort_order
                )
            )
    if not primary_set and product.images:
        product.images[0].is_primary = True
    for iid, img in existing.items():
        if iid not in seen:
            product.images.remove(img)


def _reconcile_notes(product: Product, body: ProductWriteBase) -> None:
    wanted: dict[tuple[uuid.UUID, str], int] = {}
    for n in body.notes:  # list order = display order within a position
        wanted.setdefault((n.note_id, n.position.value), len(wanted))
    keep: list[ProductNote] = []
    for pn in product.notes:
        key = (pn.note_id, pn.position)
        if key in wanted:
            pn.sort_order = wanted.pop(key)
            keep.append(pn)
    for (note_id, position), order in wanted.items():
        keep.append(ProductNote(note_id=note_id, position=position, sort_order=order))
    product.notes = keep


async def apply_write(db: AsyncSession, product: Product, body: ProductWriteBase) -> None:
    """Validate and copy everything except status/featured/ownership onto `product`."""
    await _assert_skus_free(db, body, product.id)
    await _validate_refs(db, body)
    product.slug = await unique_slug(
        db, Product, body.slug or product.slug or slugify(body.name), product.id
    )
    product.sku = body.sku
    product.name = body.name
    product.short_description = body.short_description
    product.description = body.description
    product.product_type = body.product_type
    product.brand_id = body.brand_id
    product.category_id = body.category_id
    product.gender = body.gender
    product.fragrance_family_id = body.fragrance_family_id
    product.base_price = body.base_price
    product.compare_at_price = body.compare_at_price
    product.currency = body.currency
    product.tax_rate = body.tax_rate
    product.attributes = body.attributes
    product.tags = body.tags
    _reconcile_variants(product, body)
    _reconcile_images(product, body)
    _reconcile_notes(product, body)


def new_product() -> Product:
    """An empty Product with its collections initialised, ready for apply_write."""
    return Product(variants=[], images=[], notes=[], status=ProductStatus.DRAFT)


# --- Moderation workflow ------------------------------------------------------
# DRAFT ─submit→ PENDING ─approve→ PUBLISHED ─archive→ ARCHIVED
#                  └─reject→ REJECTED ─submit→ PENDING


def _now() -> datetime:
    return datetime.now(UTC)


def submit(product: Product) -> None:
    if product.status not in (ProductStatus.DRAFT, ProductStatus.REJECTED, ProductStatus.ARCHIVED):
        raise ValidationFailedError(f"A {product.status} product can't be submitted for review")
    product.status = ProductStatus.PENDING
    product.submitted_at = _now()
    product.rejection_reason = None


def approve(product: Product, reviewer_id: uuid.UUID) -> None:
    if product.status != ProductStatus.PENDING:
        raise ValidationFailedError("Only products pending review can be approved")
    product.status = ProductStatus.PUBLISHED
    product.published_at = product.published_at or _now()
    product.reviewed_at, product.reviewed_by = _now(), reviewer_id
    product.rejection_reason = None


def reject(product: Product, reviewer_id: uuid.UUID, reason: str) -> None:
    if product.status != ProductStatus.PENDING:
        raise ValidationFailedError("Only products pending review can be rejected")
    product.status = ProductStatus.REJECTED
    product.reviewed_at, product.reviewed_by = _now(), reviewer_id
    product.rejection_reason = reason


def archive(product: Product) -> None:
    if product.status != ProductStatus.PUBLISHED:
        raise ValidationFailedError("Only published products can be archived")
    product.status = ProductStatus.ARCHIVED


def after_vendor_edit(product: Product) -> None:
    """A vendor's change to a live product goes back through review before it is
    shown again; stock-only changes use the stock endpoint and skip this."""
    if product.status == ProductStatus.PUBLISHED:
        product.status = ProductStatus.PENDING
        product.submitted_at = _now()


# --- Fragrance taxonomy admin -------------------------------------------------


async def create_family(db: AsyncSession, body: FamilyWriteIn) -> FragranceFamilyOut:
    slug = await unique_slug(db, FragranceFamily, body.slug or slugify(body.name, "family"), None)
    fam = FragranceFamily(
        name=body.name, slug=slug, description=body.description, sort_order=body.sort_order
    )
    db.add(fam)
    await db.commit()
    return FragranceFamilyOut.model_validate(fam)


async def update_family(
    db: AsyncSession, family_id: uuid.UUID, body: FamilyWriteIn
) -> FragranceFamilyOut:
    fam = await db.get(FragranceFamily, family_id)
    if fam is None:
        raise NotFoundError("Fragrance family not found")
    fam.name, fam.description, fam.sort_order = body.name, body.description, body.sort_order
    fam.slug = await unique_slug(db, FragranceFamily, body.slug or fam.slug, family_id)
    await db.commit()
    return FragranceFamilyOut.model_validate(fam)


async def delete_family(db: AsyncSession, family_id: uuid.UUID) -> None:
    fam = await db.get(FragranceFamily, family_id)
    if fam is None:
        raise NotFoundError("Fragrance family not found")
    await db.delete(fam)  # products/notes keep existing; their family_id is SET NULL
    await db.commit()


async def create_note(db: AsyncSession, body: NoteWriteBody) -> FragranceNoteOut:
    if body.family_id and not await db.get(FragranceFamily, body.family_id):
        raise ValidationFailedError("Fragrance family not found")
    slug = await unique_slug(db, FragranceNote, body.slug or slugify(body.name, "note"), None)
    note = FragranceNote(name=body.name, slug=slug, family_id=body.family_id)
    db.add(note)
    await db.commit()
    return FragranceNoteOut.model_validate(note)


async def update_note(
    db: AsyncSession, note_id: uuid.UUID, body: NoteWriteBody
) -> FragranceNoteOut:
    note = await db.get(FragranceNote, note_id)
    if note is None:
        raise NotFoundError("Fragrance note not found")
    if body.family_id and not await db.get(FragranceFamily, body.family_id):
        raise ValidationFailedError("Fragrance family not found")
    note.name, note.family_id = body.name, body.family_id
    note.slug = await unique_slug(db, FragranceNote, body.slug or note.slug, note_id)
    await db.commit()
    return FragranceNoteOut.model_validate(note)


async def delete_note(db: AsyncSession, note_id: uuid.UUID) -> None:
    note = await db.get(FragranceNote, note_id)
    if note is None:
        raise NotFoundError("Fragrance note not found")
    await db.delete(note)  # removes it from every pyramid (product_notes CASCADE)
    await db.commit()

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import Gender, NotePosition

SortOption = Literal["newest", "price_asc", "price_desc", "name", "rating", "featured"]


class _Orm(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CategoryOut(_Orm):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    image_url: str | None = None
    parent_id: uuid.UUID | None = None
    sort_order: int


class CategoryTree(CategoryOut):
    children: list["CategoryTree"] = Field(default_factory=list)


class BrandOut(_Orm):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    logo_url: str | None = None
    country: str | None = None


class FragranceFamilyOut(_Orm):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    sort_order: int = 0


class FragranceNoteOut(_Orm):
    id: uuid.UUID
    name: str
    slug: str
    family_id: uuid.UUID | None = None


class NotePyramid(BaseModel):
    top: list[FragranceNoteOut] = Field(default_factory=list)
    heart: list[FragranceNoteOut] = Field(default_factory=list)
    base: list[FragranceNoteOut] = Field(default_factory=list)


class VendorRef(_Orm):
    id: uuid.UUID
    name: str
    slug: str


class ProductImageOut(_Orm):
    id: uuid.UUID
    url: str
    alt: str | None = None
    sort_order: int
    is_primary: bool


class ProductVariantOut(_Orm):
    id: uuid.UUID
    sku: str
    name: str
    options: dict[str, Any]
    size_ml: Decimal | None = None
    price: Decimal
    compare_at_price: Decimal | None = None
    stock_quantity: int
    is_default: bool
    sort_order: int


class ProductSummary(_Orm):
    """Card-sized representation for listings."""

    id: uuid.UUID
    sku: str
    name: str
    slug: str
    short_description: str | None = None
    product_type: str
    base_price: Decimal
    compare_at_price: Decimal | None = None
    currency: str
    is_featured: bool
    rating_avg: Decimal
    rating_count: int
    brand: BrandOut | None = None
    category: CategoryOut | None = None
    vendor: VendorRef | None = None  # None = sold by the platform
    gender: Gender | None = None
    fragrance_family: FragranceFamilyOut | None = None
    primary_image: ProductImageOut | None = None
    in_stock: bool
    tags: list[str]


class ProductDetail(ProductSummary):
    description: str | None = None
    tax_rate: Decimal
    attributes: dict[str, Any]
    notes: NotePyramid = Field(default_factory=NotePyramid)
    images: list[ProductImageOut]
    variants: list[ProductVariantOut]
    published_at: datetime | None = None


class ProductFilters(BaseModel):
    q: str | None = None
    category: str | None = None
    brand: str | None = None
    product_type: str | None = None
    vendor: str | None = None  # vendor slug
    gender: Gender | None = None
    family: str | None = None  # fragrance family slug
    note: str | None = None  # fragrance note slug, any position
    min_price: Decimal | None = Field(default=None, ge=0)
    max_price: Decimal | None = Field(default=None, ge=0)
    featured: bool | None = None
    in_stock: bool | None = None
    sort: SortOption = "newest"


class FacetValue(BaseModel):
    slug: str
    name: str
    count: int


class ProductFacets(BaseModel):
    categories: list[FacetValue]
    brands: list[FacetValue]
    product_types: list[FacetValue]
    families: list[FacetValue] = Field(default_factory=list)
    genders: list[FacetValue] = Field(default_factory=list)
    price_min: Decimal | None = None
    price_max: Decimal | None = None


# --- Product writes (shared by admin and the vendor portal) ------------------


class VariantWriteIn(BaseModel):
    id: uuid.UUID | None = None  # present = update existing, absent = create new
    name: str = Field(min_length=1, max_length=120)
    sku: str | None = Field(default=None, max_length=64)  # auto-generated if omitted
    options: dict[str, str] = Field(default_factory=dict)
    size_ml: Decimal | None = Field(default=None, gt=0, le=10000)
    price: Decimal = Field(gt=0)
    compare_at_price: Decimal | None = Field(default=None, gt=0)
    stock_quantity: int = Field(default=0, ge=0)
    is_default: bool = False
    sort_order: int = 0


class ImageWriteIn(BaseModel):
    id: uuid.UUID | None = None
    url: str = Field(min_length=1, max_length=500)
    alt: str | None = Field(default=None, max_length=200)
    is_primary: bool = False
    sort_order: int = 0


class NoteWriteIn(BaseModel):
    note_id: uuid.UUID
    position: NotePosition


class ProductWriteBase(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=220)  # slugified from name if omitted
    short_description: str | None = Field(default=None, max_length=300)
    description: str | None = None
    product_type: str = Field(min_length=1, max_length=40)
    brand_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    gender: Gender | None = None
    fragrance_family_id: uuid.UUID | None = None
    notes: list[NoteWriteIn] = Field(default_factory=list, max_length=60)
    base_price: Decimal = Field(gt=0)
    compare_at_price: Decimal | None = Field(default=None, gt=0)
    currency: str = Field(default="NPR", min_length=3, max_length=3)
    tax_rate: Decimal = Field(default=Decimal("13.00"), ge=0, le=100)
    attributes: dict = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    variants: list[VariantWriteIn] = Field(min_length=1)
    images: list[ImageWriteIn] = Field(default_factory=list)


class FamilyWriteIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    slug: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    sort_order: int = 0


class NoteWriteBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    slug: str | None = Field(default=None, max_length=100)
    family_id: uuid.UUID | None = None


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)

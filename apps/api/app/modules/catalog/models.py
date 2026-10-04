"""Catalog: categories, brands, fragrance taxonomy, products, variants, images.

Fragrance family, notes (top/heart/base) and gender are real tables/columns so
they can be filtered and faceted. Everything else category-specific (shade, skin
type, longevity, ...) stays in `Product.attributes` (JSONB) so perfume and
cosmetics can carry different shapes without schema churn. See docs/README.md.

`vendor_id` NULL means the platform itself sells the product.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDMixin
from app.shared.enums import ProductStatus

# Width of product embeddings (voyage-3.5 / voyage-3-large default). Changing it
# needs a migration that rebuilds product_embeddings.
EMBEDDING_DIM = 1024


class Category(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    parent: Mapped["Category | None"] = relationship(
        remote_side="Category.id", back_populates="children"
    )
    children: Mapped[list["Category"]] = relationship(
        back_populates="parent", order_by="Category.sort_order"
    )
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Brand(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "brands"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    country: Mapped[str | None] = mapped_column(String(2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    products: Mapped[list["Product"]] = relationship(back_populates="brand")


class FragranceFamily(UUIDMixin, TimestampMixin, Base):
    """Olfactive family (Floral, Woody, Oriental/Amber, Citrus, ...)."""

    __tablename__ = "fragrance_families"

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class FragranceNote(UUIDMixin, TimestampMixin, Base):
    """A raw material/accord (Bergamot, Rose, Vetiver). `family_id` is the note's
    own family, used for browsing — not the family of products containing it."""

    __tablename__ = "fragrance_notes"

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    family_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fragrance_families.id", ondelete="SET NULL"), index=True
    )

    family: Mapped[FragranceFamily | None] = relationship(lazy="joined")


class ProductNote(Base):
    """A note in a product's pyramid. The same note can't repeat at one position."""

    __tablename__ = "product_notes"
    __table_args__ = (
        CheckConstraint("position IN ('TOP', 'HEART', 'BASE')", name="ck_product_notes_position"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fragrance_notes.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    position: Mapped[str] = mapped_column(String(10), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    note: Mapped[FragranceNote] = relationship(lazy="joined")


class Product(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_status_featured", "status", "is_featured"),
        Index("ix_products_base_price", "base_price"),
        CheckConstraint(
            "status IN ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED')",
            name="ck_products_status",
        ),
        CheckConstraint(
            "gender IS NULL OR gender IN ('WOMEN', 'MEN', 'UNISEX')", name="ck_products_gender"
        ),
    )

    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True, nullable=False)
    short_description: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    product_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)

    brand_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("brands.id", ondelete="SET NULL"), index=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    # NULL = sold by the platform. RESTRICT: a vendor with products can't be deleted.
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), index=True
    )
    fragrance_family_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fragrance_families.id", ondelete="SET NULL"), index=True
    )
    gender: Mapped[str | None] = mapped_column(String(10), index=True)

    base_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    compare_at_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="NPR", nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("13.00"), nullable=False
    )

    status: Mapped[str] = mapped_column(String(20), default=ProductStatus.DRAFT, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    attributes: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)

    rating_avg: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("0"), nullable=False)
    rating_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Moderation trail: set when a vendor submits and when an admin decides.
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    rejection_reason: Mapped[str | None] = mapped_column(String(500))

    brand: Mapped[Brand | None] = relationship(back_populates="products", lazy="joined")
    category: Mapped[Category | None] = relationship(back_populates="products", lazy="joined")
    vendor: Mapped["Vendor | None"] = relationship(lazy="joined")  # noqa: F821
    fragrance_family: Mapped[FragranceFamily | None] = relationship(lazy="joined")
    notes: Mapped[list[ProductNote]] = relationship(
        cascade="all, delete-orphan",
        order_by="ProductNote.sort_order",  # grouped TOP/HEART/BASE in the service
        lazy="selectin",
    )
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductVariant.sort_order",
        lazy="selectin",
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.sort_order",
        lazy="selectin",
    )


class ProductVariant(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "product_variants"
    __table_args__ = (
        CheckConstraint("size_ml IS NULL OR size_ml > 0", name="ck_product_variants_size_ml"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    options: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # Bottle/tube size; NULL for items not sold by volume (palettes, tools).
    size_ml: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    compare_at_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # V1: simple on-hand count. The inventory module will add reservations/transactions.
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    product: Mapped[Product] = relationship(back_populates="variants")


class ProductImage(UUIDMixin, Base):
    __tablename__ = "product_images"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    alt: Mapped[str | None] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    product: Mapped[Product] = relationship(back_populates="images")


class ProductEmbedding(Base):
    """Semantic-search vector for a product, kept out of `products` so ordinary
    catalog queries never load it. Needs the pgvector extension (the Docker image
    has it); migration 0018 skips the table when the extension is missing."""

    __tablename__ = "product_embeddings"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    # Hash of the text that was embedded; re-embed only when it changes.
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

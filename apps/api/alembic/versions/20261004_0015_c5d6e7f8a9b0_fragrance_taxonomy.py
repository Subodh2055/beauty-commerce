"""fragrance taxonomy: families, notes, product note pyramid, product gender

Backfills from the JSONB attributes the seed/admin have been writing
(`fragrance_family`, `top_notes`/`middle_notes`/`base_notes`, `gender`). The
attributes are left in place, so downgrade loses nothing.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-10-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c5d6e7f8a9b0"
down_revision: str | None = "b4c5d6e7f8a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _slug(expr: str) -> str:
    return f"trim(both '-' from lower(regexp_replace(trim({expr}), '[^a-zA-Z0-9]+', '-', 'g')))"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "fragrance_families",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
    )
    op.create_index("ix_fragrance_families_slug", "fragrance_families", ["slug"], unique=True)

    op.create_table(
        "fragrance_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("fragrance_families.id", ondelete="SET NULL"),
        ),
        *_timestamps(),
    )
    op.create_index("ix_fragrance_notes_slug", "fragrance_notes", ["slug"], unique=True)
    op.create_index("ix_fragrance_notes_family_id", "fragrance_notes", ["family_id"])

    op.create_table(
        "product_notes",
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "note_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("fragrance_notes.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("position", sa.String(10), primary_key=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint(
            "position IN ('TOP', 'HEART', 'BASE')", name="ck_product_notes_position"
        ),
    )
    op.create_index("ix_product_notes_note_id", "product_notes", ["note_id"])

    op.add_column(
        "products",
        sa.Column(
            "fragrance_family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "fragrance_families.id",
                ondelete="SET NULL",
                name="fk_products_fragrance_family_id",
            ),
        ),
    )
    op.add_column("products", sa.Column("gender", sa.String(10)))
    op.create_index("ix_products_fragrance_family_id", "products", ["fragrance_family_id"])
    op.create_index("ix_products_gender", "products", ["gender"])

    # --- backfill from attributes --------------------------------------------
    fam = "p.attributes->>'fragrance_family'"
    op.execute(
        f"""
        INSERT INTO fragrance_families (id, name, slug)
        SELECT DISTINCT ON ({_slug(fam)}) gen_random_uuid(), trim({fam}), {_slug(fam)}
        FROM products p
        WHERE coalesce(trim({fam}), '') <> ''
        ORDER BY {_slug(fam)}
        """
    )
    op.execute(
        f"""
        UPDATE products p SET fragrance_family_id = f.id
        FROM fragrance_families f WHERE f.slug = {_slug(fam)}
        """
    )

    pyramid = """
        SELECT p.id AS product_id, pos.position, n.value AS name, n.ord
        FROM products p
        CROSS JOIN (VALUES ('top_notes', 'TOP'), ('middle_notes', 'HEART'),
                           ('heart_notes', 'HEART'), ('base_notes', 'BASE')) AS pos(attr, position)
        CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(p.attributes->pos.attr) = 'array'
                 THEN p.attributes->pos.attr ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS n(value, ord)
        WHERE trim(n.value) <> ''
    """
    op.execute(
        f"""
        INSERT INTO fragrance_notes (id, name, slug)
        SELECT DISTINCT ON ({_slug("x.name")}) gen_random_uuid(), trim(x.name), {_slug("x.name")}
        FROM ({pyramid}) x
        ORDER BY {_slug("x.name")}
        """
    )
    op.execute(
        f"""
        INSERT INTO product_notes (product_id, note_id, position, sort_order)
        SELECT x.product_id, n.id, x.position, min(x.ord)::int - 1
        FROM ({pyramid}) x JOIN fragrance_notes n ON n.slug = {_slug("x.name")}
        GROUP BY x.product_id, n.id, x.position
        """
    )

    op.execute(
        """
        UPDATE products SET gender = CASE
            WHEN lower(attributes->>'gender') IN ('women', 'woman', 'female', 'feminine')
                THEN 'WOMEN'
            WHEN lower(attributes->>'gender') IN ('men', 'man', 'male', 'masculine') THEN 'MEN'
            WHEN lower(attributes->>'gender') IN ('unisex', 'gender-free', 'shared') THEN 'UNISEX'
        END
        WHERE attributes->>'gender' IS NOT NULL
        """
    )
    op.create_check_constraint(
        "ck_products_gender", "products", "gender IS NULL OR gender IN ('WOMEN', 'MEN', 'UNISEX')"
    )


def downgrade() -> None:
    op.drop_constraint("ck_products_gender", "products", type_="check")
    op.drop_index("ix_products_gender", table_name="products")
    op.drop_index("ix_products_fragrance_family_id", table_name="products")
    op.drop_column("products", "gender")
    op.drop_constraint("fk_products_fragrance_family_id", "products", type_="foreignkey")
    op.drop_column("products", "fragrance_family_id")
    op.drop_table("product_notes")
    op.drop_table("fragrance_notes")
    op.drop_table("fragrance_families")

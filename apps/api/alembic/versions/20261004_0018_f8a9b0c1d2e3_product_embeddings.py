"""product_embeddings (pgvector), with an HNSW cosine index

Created only when the `vector` extension is installed — always true on the
pgvector/pgvector Docker image; a plain local Postgres gets a warning instead,
matching migration 0001. Semantic search stays unavailable until it's added
and this migration is re-run (downgrade one step, upgrade again).

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-10-04

"""

from collections.abc import Sequence

from alembic import op

revision: str = "f8a9b0c1d2e3"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DIM = 1024  # keep in sync with catalog.models.EMBEDDING_DIM


def upgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
                CREATE TABLE product_embeddings (
                    product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
                    embedding vector({DIM}) NOT NULL,
                    model varchar(100) NOT NULL,
                    content_hash varchar(64) NOT NULL,
                    updated_at timestamptz NOT NULL DEFAULT now()
                );
                CREATE INDEX ix_product_embeddings_hnsw
                    ON product_embeddings USING hnsw (embedding vector_cosine_ops);
            ELSE
                RAISE WARNING 'pgvector not installed; product_embeddings not created.';
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS product_embeddings")

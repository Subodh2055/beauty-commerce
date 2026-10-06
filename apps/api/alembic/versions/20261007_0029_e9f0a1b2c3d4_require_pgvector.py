"""require pgvector: product_embeddings + HNSW cosine index, unconditionally

Migrations 0001 and 0018 created the extension and table only "if available",
so a database without pgvector silently had no semantic search. From here on
pgvector is required: this migration stops with install instructions when the
extension isn't available, and otherwise makes sure the extension, the table
and its HNSW index all exist (idempotent: a database where 0018 already ran
is left as it is, apart from the index build parameters).

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-10-07

"""

from collections.abc import Sequence

from alembic import op

revision: str = "e9f0a1b2c3d4"
down_revision: str | None = "d8e9f0a1b2c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DIM = 1024  # keep in sync with app.integrations.embeddings.EMBEDDING_DIM


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
                RAISE EXCEPTION USING
                    MESSAGE = 'pgvector is required but not installed on this PostgreSQL server.',
                    HINT = 'Use the pgvector/pgvector Docker image, or install pgvector '
                           '(https://github.com/pgvector/pgvector#installation), then re-run '
                           '"alembic upgrade head".';
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS product_embeddings (
            product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
            embedding vector({DIM}) NOT NULL,
            model varchar(100) NOT NULL,
            content_hash varchar(64) NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    # Rebuild with explicit parameters (0018's index used the defaults).
    op.execute("DROP INDEX IF EXISTS ix_product_embeddings_hnsw")
    op.execute(
        "CREATE INDEX ix_product_embeddings_hnsw ON product_embeddings "
        "USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)"
    )


def downgrade() -> None:
    # Back to 0018's state: keep the table (0018 owns it), restore its default index.
    op.execute("DROP INDEX IF EXISTS ix_product_embeddings_hnsw")
    op.execute(
        "CREATE INDEX ix_product_embeddings_hnsw ON product_embeddings "
        "USING hnsw (embedding vector_cosine_ops)"
    )

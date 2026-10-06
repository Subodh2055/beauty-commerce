import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.integrations.embeddings import EMBEDDING_DIM


class ProductEmbedding(Base):
    """A product's embedding, kept out of `products` so ordinary catalog queries
    never load 1024 floats. pgvector is required (migration 0029); the HNSW
    index serves cosine nearest-neighbour search.

    `content_hash` is the hash of the text that was embedded and `model` the
    provider/model that embedded it: a row is stale (and re-embedded) when
    either differs from what the product would produce now.
    """

    __tablename__ = "product_embeddings"
    __table_args__ = (
        Index(
            "ix_product_embeddings_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

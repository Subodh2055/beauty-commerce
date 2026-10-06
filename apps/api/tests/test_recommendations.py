"""Embeddings, semantic search, similar scents, personal picks and the quiz —
with a fake provider (deterministic, counts its calls, can be made to fail)."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.integrations import embeddings
from app.integrations.embeddings import EmbeddingError, HashingProvider
from app.modules.catalog.models import FragranceFamily, Product
from app.modules.recommendations import events
from app.modules.recommendations import service as reco
from app.modules.wishlist.models import WishlistItem
from app.shared.enums import ProductStatus, VendorStatus
from tests.factories import auth, make_family, make_note, make_product, make_user, make_vendor

pytestmark = pytest.mark.db


class FakeProvider(HashingProvider):
    """The offline hashing model, plus call accounting and a kill switch."""

    name = "local"

    def __init__(self, model: str = "fake-v1") -> None:
        super().__init__(model)
        self.calls: list[tuple[str, int]] = []
        self.fail = False

    async def embed(self, texts: list[str], kind: embeddings.Kind) -> list[list[float]]:
        if self.fail:
            raise EmbeddingError("provider down")
        self.calls.append((kind, len(texts)))
        return await super().embed(texts, kind)


@pytest.fixture
def fake() -> FakeProvider:
    provider = FakeProvider()
    previous = embeddings.set_provider(provider)
    yield provider
    embeddings.set_provider(previous)


async def _catalog(db):
    """Three clearly different scents, plus two that must never be recommended."""
    citrus_f = await make_family(db, "Citrus")
    woody_f = await make_family(db, "Woody Oriental")
    bergamot = await make_note(db, "Bergamot")
    lemon = await make_note(db, "Lemon")
    neroli = await make_note(db, "Neroli")
    oud = await make_note(db, "Oud")
    amber = await make_note(db, "Amber")
    rose = await make_note(db, "Rose")

    sunny = await make_product(
        db,
        name="Sunlit Bergamot",
        family=citrus_f,
        notes=[(bergamot, "TOP"), (lemon, "TOP"), (neroli, "HEART")],
    )
    sunny.description = "A fresh, zesty citrus cologne for hot summer days and warm evenings."
    grove = await make_product(
        db, name="Lemon Grove", family=citrus_f, notes=[(lemon, "TOP"), (neroli, "HEART")]
    )
    grove.description = "Bright lemon and orange blossom, light and fresh."
    dark = await make_product(
        db, name="Midnight Oud", family=woody_f, notes=[(oud, "BASE"), (amber, "BASE")]
    )
    dark.description = "Smoky oud and resinous amber, deep and intense for winter nights."
    bloom = await make_product(db, name="Velvet Rose", notes=[(rose, "HEART"), (amber, "BASE")])
    bloom.description = "Romantic rose petals over soft amber."
    hidden = await make_product(
        db,
        name="Draft Citrus Splash",
        status=ProductStatus.DRAFT,
        family=citrus_f,
        notes=[(bergamot, "TOP")],
    )
    hidden.description = "fresh citrus summer"
    suspended, _ = await make_vendor(db, status=VendorStatus.SUSPENDED)
    banned = await make_product(
        db, name="Suspended Citrus", vendor=suspended, family=citrus_f, notes=[(lemon, "TOP")]
    )
    banned.description = "fresh citrus summer evenings"
    await db.flush()
    return {
        "sunny": sunny,
        "grove": grove,
        "dark": dark,
        "bloom": bloom,
        "hidden": hidden,
        "banned": banned,
        "notes": {"bergamot": bergamot, "oud": oud, "lemon": lemon},
    }


# --- schema ---------------------------------------------------------------------------


async def test_pgvector_and_hnsw_index_exist(db) -> None:
    ext = await db.scalar(text("SELECT extversion FROM pg_extension WHERE extname = 'vector'"))
    assert ext is not None
    indexdef = await db.scalar(
        text("SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_product_embeddings_hnsw'")
    )
    assert "hnsw" in indexdef and "vector_cosine_ops" in indexdef


# --- indexing -------------------------------------------------------------------------


async def test_embedding_is_incremental_by_text_and_model(db, fake: FakeProvider) -> None:
    c = await _catalog(db)
    ids = [p.id for p in (c["sunny"], c["grove"], c["dark"])]
    assert await reco.embed_products(db, ids) == 3
    assert await reco.embed_products(db, ids) == 0  # nothing changed
    c["dark"].name = "Midnight Oud Intense"
    await db.flush()
    assert await reco.embed_products(db, ids) == 1  # only the edited product
    embeddings.set_provider(FakeProvider("fake-v2"))
    try:
        assert await reco.embed_products(db, ids) == 3  # a new model re-embeds all
    finally:
        embeddings.set_provider(fake)


def test_document_text_carries_notes_family_and_hints() -> None:
    fam = FragranceFamily(name="Citrus", slug="citrus")
    p = Product(
        name="Test", slug="t", sku="t", product_type="perfume", gender="UNISEX", tags=["summer"]
    )
    p.fragrance_family = fam
    p.notes = []
    doc = reco.document_text(p)
    assert "Citrus fragrance" in doc and "zesty" in doc and "unisex" in doc and "summer" in doc


# --- semantic search ------------------------------------------------------------------


async def test_semantic_search_ranks_meaning_and_hides_invisible(
    api: AsyncClient, db, fake
) -> None:
    c = await _catalog(db)
    await reco.embed_products(db)
    res = await api.get(
        "/api/v1/recommendations/search", params={"q": "fresh citrus scent for summer evenings"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["mode"] == "semantic"
    names = [r["product"]["name"] for r in body["results"]]
    assert names[0] in ("Sunlit Bergamot", "Lemon Grove")
    assert names.index("Sunlit Bergamot") < names.index("Midnight Oud")
    assert "Draft Citrus Splash" not in names and "Suspended Citrus" not in names
    assert all(0 <= r["match"] <= 100 for r in body["results"])
    assert body["results"][0]["match"] > body["results"][-1]["match"]
    assert c["hidden"].id  # (kept for clarity: the draft exists, it's just hidden)

    # The query vector is cached: the same search doesn't call the provider again.
    calls = len(fake.calls)
    await api.get(
        "/api/v1/recommendations/search", params={"q": "Fresh  citrus scent for summer evenings"}
    )
    assert len(fake.calls) == calls


async def test_search_falls_back_to_keywords(api: AsyncClient, db, fake) -> None:
    await _catalog(db)
    # No embeddings yet → keyword mode, still useful.
    res = (await api.get("/api/v1/recommendations/search", params={"q": "oud amber"})).json()
    assert res["mode"] == "keyword" and res["results"][0]["product"]["name"] == "Midnight Oud"
    # Provider outage → keyword mode, not an error.
    await reco.embed_products(db)
    fake.fail = True
    res = await api.get("/api/v1/recommendations/search", params={"q": "something new entirely"})
    assert res.status_code == 200 and res.json()["mode"] == "keyword"


# --- similar --------------------------------------------------------------------------


async def test_similar_scents_use_vectors_and_explain(api: AsyncClient, db, fake) -> None:
    c = await _catalog(db)
    await reco.embed_products(db)
    res = await api.get(f"/api/v1/recommendations/similar/{c['sunny'].slug}")
    assert res.status_code == 200
    rows = res.json()
    assert rows[0]["product"]["name"] == "Lemon Grove"
    assert any("Shares" in r for r in rows[0]["reasons"])
    assert "Sunlit Bergamot" not in [r["product"]["name"] for r in rows]
    # The classic route serves the same ranking (cards only).
    legacy = (await api.get(f"/api/v1/products/{c['sunny'].slug}/similar")).json()
    assert legacy[0]["name"] == "Lemon Grove"
    assert (await api.get("/api/v1/recommendations/similar/nope")).status_code == 404


# --- personal -------------------------------------------------------------------------


async def test_for_you_learns_from_wishlist_and_skips_owned(api: AsyncClient, db, fake) -> None:
    c = await _catalog(db)
    await reco.embed_products(db)
    user = await make_user(db)
    cold = (await api.get("/api/v1/recommendations/for-you", headers=auth(user))).json()
    assert cold["basis"] == "popular"
    db.add(WishlistItem(user_id=user.id, product_id=c["sunny"].id, created_at=datetime.now(UTC)))
    await db.flush()
    warm = (await api.get("/api/v1/recommendations/for-you", headers=auth(user))).json()
    assert warm["basis"] == "history"
    names = [r["product"]["name"] for r in warm["results"]]
    assert "Sunlit Bergamot" not in names  # already wishlisted
    assert names[0] == "Lemon Grove"
    assert warm["results"][0]["reasons"] == ["Similar to Sunlit Bergamot"]
    assert (await api.get("/api/v1/recommendations/for-you")).status_code == 401


# --- quiz -----------------------------------------------------------------------------


async def test_quiz_honours_likes_and_dislikes(api: AsyncClient, db, fake) -> None:
    c = await _catalog(db)
    await reco.embed_products(db)
    res = await api.post(
        "/api/v1/recommendations/quiz",
        json={
            "mood": "fresh",
            "occasion": "everyday",
            "season": "summer",
            "liked_notes": [c["notes"]["bergamot"].slug],
            "disliked_notes": [c["notes"]["oud"].slug],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["summary"] == "Fresh & energising · Everyday · Summer"
    names = [r["product"]["name"] for r in body["results"]]
    assert names[0] == "Sunlit Bergamot"
    assert "Midnight Oud" not in names  # has a disliked note
    top = body["results"][0]
    assert top["match"] > body["results"][-1]["match"]
    assert any("Bergamot" in r and "you like" in r for r in top["reasons"])


async def test_quiz_works_while_provider_is_down(api: AsyncClient, db, fake) -> None:
    await _catalog(db)
    fake.fail = True
    res = await api.post(
        "/api/v1/recommendations/quiz",
        json={"mood": "cozy", "occasion": "evening", "season": "winter"},
    )
    assert res.status_code == 200 and res.json()["results"]


# --- write hook + config --------------------------------------------------------------


async def test_product_writes_queue_a_reembed(db, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    sent: list[list[str]] = []
    monkeypatch.setattr(settings, "embedding_enqueue_on_write", True)
    monkeypatch.setattr(events, "_send", lambda ids: sent.append(ids))
    product = await make_product(db, name="Hook Test")
    await db.commit()
    product.description = "now with more vetiver"
    await db.commit()
    product.base_price = 1  # price isn't embedded: no re-embed
    await db.commit()
    import asyncio

    await asyncio.sleep(0.05)  # executor hop
    assert sent == [[str(product.id)], [str(product.id)]]


def test_remote_providers_need_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "embedding_provider", "voyage")
    monkeypatch.setattr(settings, "embedding_api_key", "")
    with pytest.raises(EmbeddingError, match="EMBEDDING_API_KEY"):
        embeddings.get_provider()
    monkeypatch.setattr(settings, "embedding_api_key", "k")
    p = embeddings.get_provider()
    assert (p.name, p.model) == ("voyage", "voyage-3.5")


def test_hashing_vectors_are_unit_length_and_deterministic() -> None:
    p = HashingProvider()
    a, b = p.vector("fresh citrus summer"), p.vector("fresh citrus summer")
    assert a == b and abs(sum(x * x for x in a) - 1) < 1e-9 and len(a) == embeddings.EMBEDDING_DIM


async def test_index_status_reports_coverage(api: AsyncClient, db, fake) -> None:
    c = await _catalog(db)
    await reco.embed_products(db, [c["sunny"].id, c["grove"].id])
    admin = await make_user(db, "ADMIN")
    res = await api.get("/api/v1/recommendations/status", headers=auth(admin))
    assert res.status_code == 200
    body = res.json()
    assert body["embedded"] == 2 and body["products"] >= 6
    assert body["stale"] == body["products"] - 2
    customer = await make_user(db)
    res = await api.get("/api/v1/recommendations/status", headers=auth(customer))
    assert res.status_code == 403

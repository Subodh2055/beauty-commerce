"""Semantic search, similar scents, personal recommendations and the scent quiz.

Indexing: each product becomes one text document (name, brand, family + plain
descriptors, gender, note pyramid, descriptions) embedded by the configured
provider. A row is re-embedded only when that text or the model changes, so the
nightly refresh and the backfill command are cheap to re-run.

Match %: cosine similarity means different things per provider (a lexical
hashing model scores lower than a neural one), so raw similarity is mapped
through a per-provider calibration band to 0–100 and blended, where it helps,
with explainable signals (shared notes, matching family). Reasons are returned
alongside so the number is never the only explanation.
"""

import hashlib
import json
import uuid
from collections.abc import Sequence

from pydantic import TypeAdapter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.integrations.embeddings import EmbeddingError, get_provider
from app.modules.catalog import repository as catalog_repo
from app.modules.catalog.models import Product
from app.modules.catalog.service import CACHE_NS as CATALOG_NS
from app.modules.catalog.service import to_summary
from app.modules.recommendations import lexicon
from app.modules.recommendations import repository as repo
from app.modules.recommendations.schemas import (
    ForYou,
    IndexStatus,
    QuizIn,
    QuizResults,
    ScoredProduct,
    SearchResults,
)

log = get_logger(__name__)

BATCH = 32
MAX_DOC_CHARS = 2400
# (similarity that maps to 0%, similarity that maps to 100%) per provider.
CALIBRATION = {"local": (0.02, 0.55), "voyage": (0.25, 0.75), "openai": (0.2, 0.7)}
_SCORED = TypeAdapter(list[ScoredProduct] | None)

POSITION_LABEL = {"TOP": "top", "HEART": "heart", "BASE": "base"}
GENDER_TEXT = {"WOMEN": "for women", "MEN": "for men", "UNISEX": "unisex, for anyone"}


# --- documents ---------------------------------------------------------------


def document_text(p: Product) -> str:
    """The text a product is embedded from."""
    parts = [p.name]
    if p.brand:
        parts.append(f"by {p.brand.name}")
    if p.fragrance_family:
        hint = lexicon.family_hint(p.fragrance_family.name)
        parts.append(f"{p.fragrance_family.name} fragrance" + (f": {hint}" if hint else ""))
    if p.gender:
        parts.append(GENDER_TEXT.get(p.gender, p.gender.lower()))
    by_pos: dict[str, list[str]] = {}
    for pn in p.notes:
        by_pos.setdefault(pn.position, []).append(pn.note.name)
    for pos in ("TOP", "HEART", "BASE"):
        if by_pos.get(pos):
            parts.append(f"{POSITION_LABEL[pos]} notes: {', '.join(by_pos[pos])}")
    for text in (p.short_description, p.description):
        if text:
            parts.append(text.strip())
    if p.tags:
        parts.append("tags: " + ", ".join(p.tags))
    return ". ".join(parts)[:MAX_DOC_CHARS]


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


async def embed_products(
    db: AsyncSession, ids: Sequence[uuid.UUID] | None = None, *, force: bool = False
) -> int:
    """Embed the given products (all when None) whose text or model changed.
    Returns how many were (re)embedded. Commits per batch."""
    provider = get_provider()
    ids = list(ids) if ids is not None else await repo.all_product_ids(db)
    done = 0
    for i in range(0, len(ids), BATCH):
        chunk = ids[i : i + BATCH]
        products = await repo.products_by_ids(db, chunk)
        meta = await repo.embedding_meta(db, chunk)
        todo: list[tuple[uuid.UUID, str, str]] = []
        for pid in chunk:
            p = products.get(pid)
            if p is None:
                continue
            text = document_text(p)
            h = content_hash(text)
            if not force and meta.get(pid) == (provider.model, h):
                continue
            todo.append((pid, text, h))
        if not todo:
            continue
        vectors = await provider.embed([t for _, t, _ in todo], "document")
        for (pid, _, h), vec in zip(todo, vectors, strict=True):
            await repo.upsert(db, pid, vec, provider.model, h)
        await db.commit()
        done += len(todo)
    if done:
        # Similar-scent lists are cached with the catalog; they may now differ.
        await cache.invalidate(CATALOG_NS)
    log.info("products_embedded", count=done, provider=provider.name, model=provider.model)
    return done


async def index_status(db: AsyncSession) -> IndexStatus:
    provider = get_provider()
    current, other = await repo.count_embedded(db, provider.model)
    total = await repo.count_products(db)
    return IndexStatus(
        provider=provider.name,
        model=provider.model,
        products=total,
        embedded=current,
        stale=other + max(0, total - current - other),
    )


# --- query vectors ------------------------------------------------------------


async def query_vector(text: str) -> list[float]:
    """Embed a search query, cached in Redis: the same text always gives the
    same vector, and providers bill per call."""
    provider = get_provider()
    norm = " ".join(text.lower().split())
    digest = hashlib.sha1(norm.encode(), usedforsecurity=False).hexdigest()
    key = f"embq:{provider.name}:{provider.model}:{digest}"
    backend = cache.get_backend()
    try:
        hit = await backend.get(key)
    except Exception as exc:  # noqa: BLE001 — cache is best-effort
        log.warning("query_cache_unavailable", error=str(exc))
        hit = None
    if hit is not None:
        return json.loads(hit)
    vector = (await provider.embed([norm], "query"))[0]
    try:
        await backend.set(key, json.dumps(vector).encode(), settings.embedding_query_cache_seconds)
    except Exception as exc:  # noqa: BLE001
        log.warning("query_cache_unavailable", error=str(exc))
    return vector


def calibrate(similarity: float) -> float:
    lo, hi = CALIBRATION.get(get_provider().name, (0.0, 1.0))
    return max(0.0, min(1.0, (similarity - lo) / (hi - lo)))


def _pct(score: float) -> int:
    return max(0, min(100, round(score * 100)))


def _notes(p: Product) -> dict[str, str]:
    """lower-case note name → display name."""
    return {pn.note.name.lower(): pn.note.name for pn in p.notes}


def _join(names: list[str], limit: int = 3) -> str:
    names = names[:limit]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + f" and {names[-1]}"


# --- semantic search ------------------------------------------------------------


async def semantic_search(db: AsyncSession, q: str, limit: int = 12) -> SearchResults:
    q = q.strip()
    try:
        hits = await repo.nearest(db, await query_vector(q), limit)
    except EmbeddingError as exc:
        log.warning("semantic_search_fallback", error=exc.message)
        hits = []
    if hits:
        results = []
        for p, sim in hits:
            reasons = []
            if p.fragrance_family:
                reasons.append(f"{p.fragrance_family.name} family")
            names = [pn.note.name for pn in p.notes if pn.note.name.lower() in q.lower()]
            if names:
                reasons.insert(0, f"Has {_join(names)}")
            results.append(
                ScoredProduct(product=to_summary(p), match=_pct(calibrate(sim)), reasons=reasons)
            )
        return SearchResults(query=q, mode="semantic", results=results)
    products = await repo.keyword(db, q, limit)
    return SearchResults(
        query=q,
        mode="keyword",
        results=[ScoredProduct(product=to_summary(p), match=0) for p in products],
    )


# --- similar scents ---------------------------------------------------------------


async def similar(db: AsyncSession, slug: str, limit: int = 8) -> list[ScoredProduct]:
    """Nearest neighbours of the product's own embedding, blended with shared
    notes (75% vector, 25% note overlap). Falls back to the note/family ranking
    when the product hasn't been embedded yet."""

    async def load() -> list[ScoredProduct] | None:
        p = await catalog_repo.get_product_by_slug(db, slug)
        if p is None:
            return None
        mine = _notes(p)
        vector = await repo.vector_of(db, p.id)
        if vector is None:
            candidates = [(c, None) for c in await catalog_repo.similar_scents(db, p, limit)]
        else:
            candidates = await repo.nearest(db, vector, limit, exclude=[p.id])
        out = []
        for c, sim in candidates:
            theirs = _notes(c)
            shared = [theirs[n] for n in theirs if n in mine]
            overlap = len(shared) / max(1, min(len(mine), len(theirs))) if mine else 0.0
            score = 0.75 * calibrate(sim) + 0.25 * overlap if sim is not None else overlap
            reasons = [f"Shares {_join(shared)}"] if shared else []
            if (
                c.fragrance_family
                and p.fragrance_family
                and c.fragrance_family_id == p.fragrance_family_id
            ):
                reasons.append(f"Also {c.fragrance_family.name}")
            out.append(ScoredProduct(product=to_summary(c), match=_pct(score), reasons=reasons))
        # The fallback keeps the catalog's own order (heart/base notes count double,
        # family is a bonus); the vector path re-sorts by the blended score.
        return out if vector is None else sorted(out, key=lambda s: s.match, reverse=True)

    rows = await cache.get_or_load(
        CATALOG_NS, cache.make_key("similar-v2", slug, limit), _SCORED, load
    )
    if rows is None:
        raise NotFoundError(f"Product '{slug}' not found")
    return rows


# --- personal ---------------------------------------------------------------------


def _cos(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


async def for_you(db: AsyncSession, user_id: uuid.UUID, limit: int = 12) -> ForYou:
    """A taste vector (weighted mean of what you bought ×2 and wishlisted ×1),
    then its nearest products you don't already have. Reason: the item of
    yours each result is closest to."""
    history = await repo.history(db, user_id)
    owned = [pid for pid, _ in history]
    vectors = await repo.vectors_of(db, owned)
    if not vectors:
        return ForYou(
            basis="popular",
            results=[
                ScoredProduct(product=to_summary(p), match=0)
                for p in await repo.popular(db, limit, owned)
            ],
        )
    weights = dict(history)
    taste = [0.0] * len(next(iter(vectors.values())))
    for pid, vec in vectors.items():
        for i, x in enumerate(vec):
            taste[i] += x * weights[pid]
    norm = sum(x * x for x in taste) ** 0.5 or 1.0
    taste = [x / norm for x in taste]
    hits = await repo.nearest(db, taste, limit, exclude=owned)
    names = await repo.products_by_ids(db, list(vectors))
    hit_vectors = await repo.vectors_of(db, [p.id for p, _ in hits])
    results = []
    for p, sim in hits:
        p_vec = hit_vectors.get(p.id)
        reasons = []
        if p_vec:
            anchor = max(vectors, key=lambda pid: _cos(vectors[pid], p_vec))
            if anchor in names:
                reasons.append(f"Similar to {names[anchor].name}")
        results.append(
            ScoredProduct(product=to_summary(p), match=_pct(calibrate(sim)), reasons=reasons)
        )
    return ForYou(basis="history", results=results)


# --- quiz -----------------------------------------------------------------------------


async def quiz(db: AsyncSession, body: QuizIn, limit: int = 12) -> QuizResults:
    """Rank by 45% semantic fit to your answers, 35% note fit (your liked notes,
    or the mood's signature notes), 20% family fit. Products with a note you
    dislike are left out entirely."""
    mood, occasion, season = (
        lexicon.MOODS[body.mood],
        lexicon.OCCASIONS[body.occasion],
        lexicon.SEASONS[body.season],
    )
    liked = {n.name.lower(): n.name for n in await repo.notes_by_slugs(db, body.liked_notes)}
    disliked = {n.name.lower() for n in await repo.notes_by_slugs(db, body.disliked_notes)}
    query = ". ".join(
        filter(
            None,
            [
                mood.words,
                occasion.words,
                season.words,
                ", ".join(sorted(mood.families | season.families)),
                f"notes: {', '.join(liked.values())}" if liked else "",
            ],
        )
    )
    try:
        candidates = await repo.nearest(
            db, await query_vector(query), 80, gender=body.gender, max_price=body.max_price
        )
    except EmbeddingError:
        candidates = []
    if not candidates:
        candidates = [(p, None) for p in await repo.popular(db, 80)]

    scored = []
    for p, sim in candidates:
        notes = _notes(p)
        if disliked & notes.keys():
            continue
        if liked:
            hits = [liked[n] for n in liked if n in notes]
            note_fit = len(hits) / len(liked)
        else:
            hits = [notes[n] for n in notes if n in mood.notes]
            note_fit = min(1.0, len(hits) / 2)
        family = p.fragrance_family.name.lower() if p.fragrance_family else ""
        family_fit = (
            1.0
            if family in mood.families
            else 0.6
            if family in season.families or family in occasion.families
            else 0.0
        )
        sem = calibrate(sim) if sim is not None else 0.0
        score = 0.45 * sem + 0.35 * note_fit + 0.20 * family_fit
        reasons = []
        if hits:
            reasons.append(f"Has {_join(hits)}" + (", which you like" if liked else ""))
        if family_fit == 1.0:
            reasons.append(f"{p.fragrance_family.name}: suits a {mood.label.lower()} mood")
        elif family_fit:
            fits = season if family in season.families else occasion
            reasons.append(f"{p.fragrance_family.name} works for {fits.label.lower()}")
        scored.append(
            (score, ScoredProduct(product=to_summary(p), match=_pct(score), reasons=reasons))
        )
    scored.sort(key=lambda t: t[0], reverse=True)
    return QuizResults(
        summary=" · ".join((mood.label, occasion.label, season.label)),
        results=[s for _, s in scored[:limit]],
    )

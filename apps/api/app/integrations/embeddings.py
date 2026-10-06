"""Embedding providers behind one interface.

`get_provider()` picks the implementation from settings (EMBEDDING_PROVIDER):

- `local`  — offline feature hashing (word + bigram buckets, signed, L2-normalised).
             No key, no network, deterministic. Lexical, not semantic: "citrus"
             matches "citrus", not "lemon". Fine for development and CI.
- `voyage` — Voyage AI embeddings (document/query input types).
- `openai` — any OpenAI-compatible /embeddings endpoint, asked for EMBEDDING_DIM dims.

Every provider returns unit-length vectors of EMBEDDING_DIM floats, so cosine
distance in pgvector means the same thing whichever one produced them.
"""

import hashlib
import math
import re
from typing import Literal, Protocol

import httpx

from app.core.config import settings
from app.core.exceptions import AppError

EMBEDDING_DIM = 1024
Kind = Literal["document", "query"]


class EmbeddingError(AppError):
    """The provider is misconfigured or unreachable. Search falls back to
    keywords; indexing retries on the next refresh."""

    status_code = 503
    code = "embedding_unavailable"


class EmbeddingProvider(Protocol):
    name: str
    model: str
    dim: int

    async def embed(self, texts: list[str], kind: Kind) -> list[list[float]]: ...


def _normalise(v: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in v))
    return [x / norm for x in v] if norm else v


_WORD = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")
_STOP = frozenset(
    "a an and are as at be but by for from has have i in is it its me my of on or our so "
    "that the this to was we with you your".split()
)


class HashingProvider:
    """Deterministic bag-of-words embedding via the hashing trick."""

    name = "local"
    dim = EMBEDDING_DIM

    def __init__(self, model: str = "hashing-v1") -> None:
        self.model = model

    @staticmethod
    def _bucket(token: str) -> tuple[int, float]:
        h = hashlib.blake2b(token.encode(), digest_size=8).digest()
        n = int.from_bytes(h, "little")
        return n % EMBEDDING_DIM, 1.0 if (n >> 63) & 1 else -1.0

    def vector(self, text: str) -> list[float]:
        words = [w for w in _WORD.findall(text.lower()) if w not in _STOP]
        tokens = [(w, 1.0) for w in words]
        # Bigrams carry a little phrase signal ("white musk" ≠ "white" + "musk").
        tokens += [(f"{a}_{b}", 0.5) for a, b in zip(words, words[1:], strict=False)]
        v = [0.0] * EMBEDDING_DIM
        for token, weight in tokens:
            idx, sign = self._bucket(token)
            v[idx] += sign * weight
        return _normalise(v)

    async def embed(self, texts: list[str], kind: Kind) -> list[list[float]]:
        return [self.vector(t) for t in texts]


class _HttpProvider:
    dim = EMBEDDING_DIM
    batch_size = 64

    def __init__(self, model: str, api_key: str, base_url: str) -> None:
        if not api_key:
            raise EmbeddingError(f"EMBEDDING_API_KEY is required for the {self.name} provider")
        self.model = model
        self._key = api_key
        self._url = base_url.rstrip("/") + "/embeddings"

    def _payload(self, texts: list[str], kind: Kind) -> dict: ...

    async def embed(self, texts: list[str], kind: Kind) -> list[list[float]]:
        out: list[list[float]] = []
        async with httpx.AsyncClient(timeout=settings.embedding_timeout_seconds) as client:
            for i in range(0, len(texts), self.batch_size):
                chunk = texts[i : i + self.batch_size]
                try:
                    res = await client.post(
                        self._url,
                        headers={"Authorization": f"Bearer {self._key}"},
                        json=self._payload(chunk, kind),
                    )
                    res.raise_for_status()
                except httpx.HTTPError as exc:
                    raise EmbeddingError(f"{self.name} embeddings failed: {exc}") from exc
                rows = sorted(res.json()["data"], key=lambda d: d["index"])
                for row in rows:
                    vec = row["embedding"]
                    if len(vec) != EMBEDDING_DIM:
                        raise EmbeddingError(
                            f"{self.name} returned {len(vec)} dims; expected {EMBEDDING_DIM}"
                        )
                    out.append(_normalise(vec))
        return out


class VoyageProvider(_HttpProvider):
    name = "voyage"

    def _payload(self, texts: list[str], kind: Kind) -> dict:
        return {
            "input": texts,
            "model": self.model,
            "input_type": kind,
            "output_dimension": EMBEDDING_DIM,
        }


class OpenAIProvider(_HttpProvider):
    name = "openai"

    def _payload(self, texts: list[str], kind: Kind) -> dict:
        return {"input": texts, "model": self.model, "dimensions": EMBEDDING_DIM}


_DEFAULTS = {
    "local": ("hashing-v1", ""),
    "voyage": ("voyage-3.5", "https://api.voyageai.com/v1"),
    "openai": ("text-embedding-3-small", "https://api.openai.com/v1"),
}

_override: EmbeddingProvider | None = None


def get_provider() -> EmbeddingProvider:
    """The configured provider (or the one a test installed with `set_provider`)."""
    if _override is not None:
        return _override
    kind = settings.embedding_provider
    model, url = _DEFAULTS[kind]
    model = settings.embedding_model or model
    if kind == "local":
        return HashingProvider(model)
    cls = VoyageProvider if kind == "voyage" else OpenAIProvider
    return cls(model, settings.embedding_api_key, settings.embedding_base_url or url)


def set_provider(provider: EmbeddingProvider | None) -> EmbeddingProvider | None:
    """Swap the provider (tests); returns the previous override."""
    global _override
    previous, _override = _override, provider
    return previous

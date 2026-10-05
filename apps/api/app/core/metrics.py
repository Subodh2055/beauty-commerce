"""Request latency for the system-health page.

A bounded ring buffer of recent requests in this process, fed by
RequestContextMiddleware. Each API worker keeps its own, so with several
workers the health page shows the one that served it. That's plenty to spot
"the API got slow"; long-term metrics belong in Prometheus (see
infrastructure/monitoring).
"""

import re
import time
from collections import deque
from dataclasses import dataclass

WINDOW_SECONDS = 300
MAX_SAMPLES = 5000
STARTED_AT = time.time()

# /api/v1/admin/orders/3f2c...-... → /api/v1/admin/orders/{id}
_ID = re.compile(r"/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)(?=/|$)")


@dataclass(frozen=True, slots=True)
class Sample:
    at: float
    method: str
    route: str
    status: int
    ms: float


_samples: deque[Sample] = deque(maxlen=MAX_SAMPLES)


def observe(method: str, path: str, status: int, ms: float) -> None:
    if not path.startswith("/api/") or path.startswith("/api/v1/health"):
        return  # probes would drown out real traffic
    _samples.append(Sample(time.time(), method, _ID.sub("/{id}", path), status, ms))


def _pct(sorted_ms: list[float], p: float) -> float:
    if not sorted_ms:
        return 0.0
    i = min(len(sorted_ms) - 1, max(0, round(p / 100 * len(sorted_ms)) - 1))
    return round(sorted_ms[i], 1)


def snapshot() -> dict:
    cutoff = time.time() - WINDOW_SECONDS
    recent = [s for s in _samples if s.at >= cutoff]
    ms = sorted(s.ms for s in recent)
    by_route: dict[str, list[float]] = {}
    for s in recent:
        by_route.setdefault(f"{s.method} {s.route}", []).append(s.ms)
    slowest = sorted(
        ({"route": r, "count": len(v), "p95_ms": _pct(sorted(v), 95)} for r, v in by_route.items()),
        key=lambda x: x["p95_ms"],
        reverse=True,
    )[:5]
    return {
        "window_seconds": WINDOW_SECONDS,
        "requests": len(recent),
        "per_minute": round(len(recent) / (WINDOW_SECONDS / 60), 1),
        "p50_ms": _pct(ms, 50),
        "p95_ms": _pct(ms, 95),
        "p99_ms": _pct(ms, 99),
        "error_rate": round(sum(s.status >= 500 for s in recent) / len(recent), 4)
        if recent
        else 0.0,
        "slowest": slowest,
        "uptime_seconds": int(time.time() - STARTED_AT),
    }


def reset() -> None:
    _samples.clear()

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: bool | None = None
    redis: bool | None = None


ComponentStatus = Literal["ok", "degraded", "down", "unknown"]


class Component(BaseModel):
    """One dependency on the system-health page."""

    key: str
    name: str
    status: ComponentStatus
    latency_ms: float | None = None
    summary: str  # one line for the status card
    details: dict[str, str | int | float | bool | None] = {}
    error: str | None = None


class CeleryWorker(BaseModel):
    name: str
    active_tasks: int
    processed: int | None = None
    concurrency: int | None = None


class QueueDepth(BaseModel):
    name: str
    pending: int | None = None


class RouteLatency(BaseModel):
    route: str
    count: int
    p95_ms: float


class ApiLatency(BaseModel):
    window_seconds: int
    requests: int
    per_minute: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    error_rate: float
    slowest: list[RouteLatency]
    uptime_seconds: int


class SystemHealth(BaseModel):
    status: ComponentStatus  # worst of the components
    checked_at: datetime
    environment: str
    components: list[Component]
    workers: list[CeleryWorker]
    queues: list[QueueDepth]
    api: ApiLatency

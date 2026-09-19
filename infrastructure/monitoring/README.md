# Monitoring

Planned for Phase 8 (Production):

- **Sentry** — set `SENTRY_DSN` in `.env`; the API initialises the SDK when it is non-empty.
- **Prometheus** — scrape `/metrics` from the API (to be added via `prometheus-fastapi-instrumentator`).
- **Grafana** — dashboards for request latency, error rate, Celery queue depth, Postgres connections.

Add `prometheus.yml` and Grafana provisioning here when wiring it up.

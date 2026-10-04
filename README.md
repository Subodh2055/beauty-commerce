# Beauty Commerce

AI-powered perfume, cosmetics, skincare and beauty e-commerce platform.
Web + iOS + Android, built as a **modular monolith**: FastAPI owns all business
logic, PostgreSQL is the source of truth, n8n handles external automation.

## Stack

| Layer | Technology |
|---|---|
| Web | Next.js 16 · TypeScript · Tailwind CSS 4 |
| Mobile | Flutter (planned, `apps/mobile`) |
| Backend | Python 3.13 · FastAPI · SQLAlchemy 2 · Alembic |
| Database | PostgreSQL 16 + pgvector |
| Cache / queue | Redis 7 · Celery (+ beat) |
| Automation | n8n |
| Infra | Docker Compose · Nginx · Cloudflare · Ubuntu VPS |

## Repository layout

```text
beauty-commerce/
├── apps/
│   ├── web/                  # Next.js storefront + admin
│   ├── mobile/               # Flutter (later phase)
│   └── api/                  # FastAPI backend
├── packages/
│   ├── api-contracts/        # Shared OpenAPI / TS types
│   └── config/               # Shared lint/format config
├── infrastructure/
│   ├── docker/               # Compose files
│   ├── nginx/                # Reverse proxy config
│   └── monitoring/           # Prometheus / Grafana
└── docs/
```

## Quick start (Docker)

```bash
cp .env.example .env
make up            # or on Windows without make: .\make.ps1 up
```

The root `docker-compose.yml` uses Compose `include:` to pull in
`infrastructure/docker/compose.dev.yml` and points its `${VAR}` interpolation at
the root `.env`, so plain `docker compose up --build` works too.
`up` builds and waits until every healthcheck passes.

- Site through nginx: http://localhost (`NGINX_HOST_PORT` to change)
- API direct: http://localhost:8000 — docs at `/docs`, health at `/api/v1/health` (`/ready` checks DB + Redis)
- Web direct: http://localhost:3000
- n8n: http://localhost:5678

Services: postgres, redis, api (uvicorn `--reload`), worker, beat, web (Next dev, HMR),
nginx, n8n. In dev, beat also sends `system.ping` every 60 s
(`BEAT_HEARTBEAT_SECONDS`), so `make logs s=worker` shows beat → worker working.

### Make targets

| `make …` | `.\make.ps1 …` | Does |
|---|---|---|
| `up` | `up` | build + start the stack, wait for healthy |
| `down` | `down` | stop the stack |
| `logs [s=api]` | `logs [api]` | follow logs (one service or all) |
| `migrate` | `migrate` | `alembic upgrade head` in the api container |
| `makemigration m="msg"` | `makemigration "msg"` | autogenerate a revision (lands in `apps/api/alembic/versions`) |
| `seed` | `seed` | idempotent demo catalog |
| `test` | `test` | pytest in the api container |
| `lint` | `lint` | ruff check + format check, then web eslint |

Target prod with `make up FILE=docker-compose.prod.yml` / `.\make.ps1 up -File docker-compose.prod.yml`.

### Scheduled jobs (Celery beat, UTC)

| Job | When | Task |
|---|---|---|
| Daily analytics rollup (placeholder: logs per-status order count/value for yesterday) | 00:15 | `analytics.daily_rollup` |
| Purge lapsed refresh tokens + carts idle > `CART_RETENTION_DAYS` (90) | 03:00 | `maintenance.purge_expired` |
| Re-queue uploads stuck in PENDING (broker was down at upload time) | every 15 min | `media.retry_pending` |

Run exactly one beat container per deployment, or jobs fire twice.

### nginx routing and caching (dev and prod share `infrastructure/nginx/snippets/`)

- `/api/v1/*` and `/uploads/*` go to FastAPI; everything else goes to Next
  (`/api/session` is a Next route handler, so only `/api/v1` goes to the API).
- `/_next/static/*` → `public, max-age=31536000, immutable`
- images (`/_next/image`, `/uploads/*`, `*.png|jpg|webp|avif|svg|ico|gif`) → 30 days
- HTML → `no-cache` (an upstream `no-store` is kept as-is)

## Quick start (one command, Windows)

```powershell
.\scripts\dev-up.ps1        # Postgres + Redis in Docker, migrate, seed demo catalog
.\scripts\dev-up.ps1 -Full  # …then the whole stack in Docker (calls .\make.ps1 up)
```

## Quick start (local, without Docker for app code)

Start only the data services:

```bash
docker compose up -d --wait postgres redis
```

Backend:

```bash
cd apps/api
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

Web:

```bash
cd apps/web
npm install
npm run dev
```

## Backend module pattern

Every domain module under `apps/api/app/modules/<name>/` follows:

```text
router.py        # HTTP concerns only
schemas.py       # Pydantic request/response contracts
models.py        # SQLAlchemy models
service.py       # Business logic + transactions
repository.py    # Persistence queries
dependencies.py  # FastAPI dependencies for this module
```

## Marketplace

| Module | What it owns | Main routes (`/api/v1`) |
|---|---|---|
| `users` + `auth` | roles, **permissions** (`role_permissions`), `require_permission()` | `/auth/*`, `/users/me/*` |
| `vendors` | applications → PENDING / APPROVED / REJECTED / SUSPENDED, commission override, vendor portal | `/vendors/apply`, `/vendors/me`, `/vendors/{slug}`, `/vendor/*`, `/admin/vendors/*` |
| `catalog` | brands, categories, fragrance families + notes (top/heart/base), gender, `size_ml`, vendor ownership, moderation, `product_embeddings` (pgvector) | `/products`, `/fragrance/{families,notes}`, `/admin/products/{id}/{approve,reject}` |
| `orders` | one `vendor_orders` row per seller with a commission snapshot | `/orders`, `/vendor/orders/*` |
| `payments` | provider registry (`integrations/payments.py`), signed + idempotent callbacks | `/payments/{provider}/callback` |
| `payouts` | bundles delivered + paid sub-orders into payouts | `/admin/payouts/*`, `/vendor/payouts/*` |
| `cms` | homepage banners with schedule windows | `/cms/banners`, `/admin/banners/*` |
| `support` | tickets, staff replies, internal notes | `/support/tickets/*`, `/admin/support/*` |
| `audit` | `audit_logs` for every admin/vendor change | `/admin/audit-logs` |
| `settings` | platform settings (commission default, shipping, payout minimum) | `/settings/public`, `/admin/settings` |
| `media` | uploads + Celery resize → WebP renditions (400/800/1600/full) | `/admin/uploads`, `/vendor/uploads`, `/media/{id}` |

**Roles → permissions** (seeded by migration 0011; SUPER_ADMIN passes every check):

| Role | Permissions |
|---|---|
| SUPER_ADMIN | everything |
| ADMIN | everything except `settings.manage` |
| STAFF | `dashboard.read`, `orders.manage`, `inventory.manage`, `support.manage`, `media.upload` |
| VENDOR | `vendor.portal`, `media.upload` (granted on approval) |
| CUSTOMER | — |

**Product moderation:** `DRAFT → PENDING → PUBLISHED`, or `PENDING → REJECTED → PENDING`.
A vendor editing a live product sends it back to PENDING; stock-only changes
(`PUT /vendor/variants/{id}/stock`) don't. Suspending a vendor hides their products.

**Money:** commission = vendor override or `default_commission_rate` (15%), charged
on each seller's line subtotal and snapshotted on the sub-order at checkout.
Coupons and shipping are platform-level. A payout covers sub-orders that are
DELIVERED, on an order whose payment is PAID, and not already paid out.

**Payments in dev:** `PAYMENT_STUB_ENABLED=true` (on in the dev compose file) makes
eSewa/Khalti/Stripe checkouts use a fake gateway; confirm one with a signed callback
(`app.integrations.payments.stub_signature`). Real providers are one class each in
`app/integrations/payments.py`.

**Caching:** public catalog and banner reads are cached in Redis under a versioned
namespace. Any committed catalog change bumps the version; stock changes only do
when a variant crosses zero, so stock counts can lag by `CACHE_TTL_SECONDS`.
Redis being down only means cache misses.

**Demo data:** `make seed` adds fragrance families/notes, the catalogue, two
approved demo vendors (owners `attar@vendors.example.com` and
`glow@vendors.example.com`, password `Vendor@12345` — dev only, never seeded in
production), one pending application, a product awaiting moderation, and banners.

### Tests

`make test` runs everything. DB-backed tests (`@pytest.mark.db`) need
`TEST_DATABASE_URL` (set in the dev compose file): the suite drops and recreates
that database, runs every migration up, down and up again, then gives each test
a session that is rolled back afterwards. Without it they are skipped.

## Roadmap

V1 Core Store → V2 AI Features → V3 Marketplace → V4 Advanced AI & Analytics.
See `docs/` for the detailed plan.

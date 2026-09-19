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
| Cache / queue | Redis 7 · Celery |
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

## Quick start (one command, Windows)

```powershell
.\scripts\dev-up.ps1        # Postgres + Redis in Docker, migrate, seed demo catalog
.\scripts\dev-up.ps1 -Full  # …and run api/worker/n8n/web in Docker too
```

## Quick start (Docker)

```bash
cp .env.example .env
docker compose --env-file .env -f infrastructure/docker/compose.dev.yml up --build
```

`--env-file .env` is required because the Compose files live in a subfolder;
it makes `${POSTGRES_USER}`-style interpolation work.

- API: http://localhost:8000 — docs at `/docs`, health at `/api/v1/health`
- Web: http://localhost:3000
- n8n: http://localhost:5678

## Quick start (local, without Docker for app code)

Start only the data services:

```bash
docker compose --env-file .env -f infrastructure/docker/compose.dev.yml up postgres redis
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

## Roadmap

V1 Core Store → V2 AI Features → V3 Marketplace → V4 Advanced AI & Analytics.
See `docs/` for the detailed plan.

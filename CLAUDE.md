# Beauty Commerce — working notes for Claude

Monorepo: `apps/api` (FastAPI), `apps/web` (Next.js 16), `apps/mobile` (Flutter, later),
`infrastructure/` (Compose, Nginx), `packages/` (shared contracts/config), `docs/`.

## Rules that come from the project plan
- Modular monolith. FastAPI owns all business logic and DB transactions; Next.js only renders and calls the API.
- Every backend module lives in `apps/api/app/modules/<name>/` with `router.py`, `schemas.py`, `models.py`,
  `service.py`, `repository.py`, `dependencies.py`. Register its router in `app/modules/__init__.py` and
  import its models in `app/models.py` (Alembic autogenerate depends on it).
- Error responses always use the envelope from `app/core/exceptions.py`; raise `AppError` subclasses, not `HTTPException`.
- Money / inventory / order operations wrap a single DB transaction.
- AI code never bypasses authorization or business rules.
- Stable dependency versions only — pin with upper bounds in `pyproject.toml`.

## Marketplace conventions
- Gate new routes with `require_permission(Permission.X)` (shared/enums.py), not `require_roles`.
  A new permission needs a migration that inserts it and its `role_permissions` grants.
- Admin and vendor routers declare `dependencies=[Audited]`; the audit listener then logs every ORM
  change in that request. Bulk SQL and association rows (e.g. role grants) need `audit.record(...)`.
  `tests/test_permissions_audit.py` fails if a mutating /admin or /vendor route lacks either.
- Vendor isolation: portal code takes the vendor from `CurrentVendor`/`ActiveVendor` and reads
  only through repository functions that require `vendor_id`. Foreign ids are 404, never 403.
- Public or credential-handling write endpoints get a `limit(...)` dependency (`app/core/ratelimit.py`);
  the client IP comes from nginx's X-Real-IP, never the first X-Forwarded-For entry.
- Public catalog/CMS reads go through `app.core.cache.get_or_load`. Catalog writes invalidate
  automatically (`catalog/cache.py`); other namespaces call `cache.invalidate(ns)` after commit.
- Commission is snapshotted on `vendor_orders` at checkout; never recompute past orders.

## Web design system
- Read `design-system/beauty-commerce/MASTER.md` before UI work (page overrides in `pages/`). Tokens live in
  `apps/web/src/app/globals.css`; primitives in `apps/web/src/components/ui/`. No raw hex/palette colours or `text-[Npx]`.
- Themes: class strategy, light default, `.dark` opt-in via ThemeToggle; `npm run check:contrast` must pass.

## Commands
- Docker stack: `.\make.ps1 <target>` (Windows) or `make <target>`. Targets: up, down, logs, migrate,
  makemigration, seed, test, lint; these run inside the containers. `-File docker-compose.prod.yml` / `FILE=...` for prod.
- Root `docker-compose.yml` / `docker-compose.prod.yml` `include:` `infrastructure/docker/compose.{dev,prod}.yml`
  and read the root `.env`, so plain `docker compose up --build` works (no `--env-file` needed).
- Dev entry point is nginx at http://localhost; api :8000 and web :3000 are also exposed directly.
- Bootstrap with app code on the host: `.\scripts\dev-up.ps1` (Docker data services + migrate + seed); `-Full` = `make.ps1 up`
- DB tests: set `TEST_DATABASE_URL` (db name must end `_test`; the suite drops/recreates it and runs
  migrations up/down/up). Use `tests/factories.py`; mark with `pytestmark = pytest.mark.db`.
- Host-side equivalents: seed `cd apps/api && python -m app.scripts.seed_catalog` (idempotent), tests `pytest`,
  lint `ruff check . && ruff format --check .`, migration `alembic revision --autogenerate -m "..."`
- Web: `cd apps/web && npm run dev` / `npm run build` / `npm run lint`
- E2E (Playwright, against a running stack with PAYMENT_STUB_ENABLED=true): `cd apps/web && npx playwright test`;
  env E2E_BASE_URL / E2E_API_URL, E2E_CHANNEL=msedge to use the installed browser. Includes an axe +
  sideways-scroll sweep at 375/768/1280/1920.

## Infra notes
- nginx routes only `/api/v1/*` (+ `/uploads/*`) to FastAPI. Other `/api/*` paths are Next route handlers
  (`/api/session`). Shared routing/cache rules live in `infrastructure/nginx/snippets/`; edit there, not per env.
- Beat schedule is in `app/workers/celery_app.py`; tasks in `app/workers/tasks.py` call module services and
  use `_run_with_session` (NullPool engine per call). Exactly one beat container per deployment.
- Healthchecks are defined in compose, not the API Dockerfile (the same image runs worker and beat).

## Environment
- Windows host. Use PowerShell for shell commands — the Git Bash tool has no PATH here.
- Next.js 16 has breaking changes vs. older versions; see `apps/web/AGENTS.md` and `node_modules/next/dist/docs/`.

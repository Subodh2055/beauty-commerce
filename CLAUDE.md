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

## Commands
- Bootstrap everything locally: `.\scripts\dev-up.ps1` (Docker data services + migrate + seed)
- Seed demo catalog: `cd apps/api && python -m app.scripts.seed_catalog` (idempotent)
- API tests: `cd apps/api && pytest`
- API lint: `cd apps/api && ruff check . && ruff format --check .`
- New migration: `cd apps/api && alembic revision --autogenerate -m "..."`
- Web: `cd apps/web && npm run dev` / `npm run build` / `npm run lint`
- Everything in Docker: `docker compose --env-file .env -f infrastructure/docker/compose.dev.yml up --build`
  (`--env-file` is needed for `${VAR}` interpolation since the compose files sit in a subfolder)

## Environment
- Windows host. Use PowerShell for shell commands — the Git Bash tool has no PATH here.
- Next.js 16 has breaking changes vs. older versions; see `apps/web/AGENTS.md` and `node_modules/next/dist/docs/`.

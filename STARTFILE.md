# Starting Beauty Commerce locally

Run these from **PowerShell** on Windows. Every path is relative to the repo root (`D:\2026\perfume-brand`).

The API reads `.env` from the repo root, and so does Docker Compose. If `.env` is missing, create it first:

```powershell
Copy-Item .env.example .env
```

---

## Option A: everything in Docker (simplest)

You need Docker Desktop running, with virtualization enabled in the BIOS.

```powershell
.\make.ps1 up          # build and start postgres, redis, api, worker, beat, web, nginx
.\make.ps1 migrate     # apply database migrations
.\make.ps1 seed        # demo catalog, vendors and reviews (dev only; safe to re-run)
```

Then open these URLs:

| What | URL |
|---|---|
| Site (through nginx) | http://localhost |
| Web app directly | http://localhost:3000 |
| API docs | http://localhost:8000/docs |

Other commands:

```powershell
.\make.ps1 logs          # all logs
.\make.ps1 logs api      # one service (api, worker, beat, web, ...)
.\make.ps1 test          # API tests inside the container
.\make.ps1 lint
.\make.ps1 down          # stop everything
```

---

## Option B: code on your machine, databases in Docker

```powershell
.\scripts\dev-up.ps1     # starts postgres + redis in Docker, creates the venv, migrates, seeds
```

Then start the app processes in separate terminals, as in Option C (steps 3 to 6).

---

## Option C: everything on your machine (no Docker)

### 1. Postgres and Redis

The API connects to whatever `DATABASE_URL` and `REDIS_URL` say in `.env`. Point them at your own Postgres and Redis.

- If Redis isn't running, the API still works: the cache turns itself off. Celery (emails, image processing, the nightly rollup) needs Redis.
- To run without Redis at all, set `CACHE_ENABLED=false` in `.env`.

### 2. API setup (first time only)

```powershell
cd apps\api
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\alembic.exe upgrade head              # create or upgrade the tables
.\.venv\Scripts\python.exe -m app.scripts.seed_catalog # demo data (dev only)
```

### 3. API server (terminal 1)

```powershell
cd apps\api
.\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

- Health check: http://localhost:8000/api/v1/health
- API docs: http://localhost:8000/docs

### 4. Celery worker (terminal 2, needs Redis)

```powershell
cd apps\api
.\.venv\Scripts\celery.exe -A app.workers.celery_app worker --loglevel=info --pool=solo
```

`--pool=solo` is needed on Windows.

### 5. Celery beat (terminal 3, needs Redis)

```powershell
cd apps\api
.\.venv\Scripts\celery.exe -A app.workers.celery_app beat --loglevel=info
```

Beat runs the scheduled jobs:

- the nightly analytics rollup (00:15 UTC)
- cleanup (03:00 UTC)
- the media retry (every 15 minutes)
- a heartbeat every 60 seconds, which the super-admin **System health** page reads

Run **exactly one** beat process.

### 6. Web app (terminal 4)

```powershell
cd apps\web
npm install          # first time only
npm run dev          # http://localhost:3000
```

Production-like run of the web app:

```powershell
cd apps\web
npm run build
npm run start        # http://localhost:3000
```

The web app calls the API at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`).

---

## pgvector is required

The database must have the **pgvector** extension. The Docker image (`pgvector/pgvector:pg16`) already includes it.

On a plain Windows PostgreSQL, `alembic upgrade head` stops with:

```
pgvector is required but not installed on this PostgreSQL server.
```

Ways to fix that:

- **Use Docker** for Postgres (Option A or B). This is the easiest.
- **Install pgvector into your PostgreSQL.** Prebuilt Windows binaries exist for some versions, or you can build it with Visual Studio
  (see https://github.com/pgvector/pgvector#windows).
- **Run a separate PostgreSQL 16 that already has pgvector**, from conda-forge (no admin rights needed):
  ```powershell
  # micromamba: https://mamba.readthedocs.io (single exe)
  micromamba create -y -p C:\pg16 -c conda-forge postgresql=16 pgvector
  C:\pg16\Libraryin\initdb.exe -D C:\pg16data -U beauty -A trust -E UTF8
  C:\pg16\Libraryin\pg_ctl.exe -D C:\pg16data -o "-p 26432" -l C:\pg16data\log.txt start
  C:\pg16\Libraryin\createdb.exe -h localhost -p 26432 -U beauty beauty_commerce
  ```
  Then set `DATABASE_URL=postgresql+asyncpg://beauty@localhost:26432/beauty_commerce` in `.env`.

## Embeddings (search by meaning, similar scents, the scent quiz)

```powershell
cd appspi
.\.venv\Scripts\python.exe -m app.scripts.embed_products            # embed new or changed products
.\.venv\Scripts\python.exe -m app.scripts.embed_products --status   # coverage
.\.venv\Scripts\python.exe -m app.scripts.embed_products --force    # everything (after switching provider)
```

- Run the first command once after seeding.
- After that, saving a product queues a re-embed through the Celery worker, and beat refreshes anything stale nightly at 01:00 UTC.
- If you aren't running Celery, re-run the first command whenever you like; unchanged products are skipped.

Provider settings in `.env`:

- `EMBEDDING_PROVIDER=local` is offline and needs no key.
- `voyage` or `openai` need `EMBEDDING_API_KEY` and give much better matches.

---

## Make yourself an admin

Register on the site (http://localhost:3000/register), then grant a role:

```powershell
cd apps\api
.\.venv\Scripts\python.exe -m app.scripts.grant_role you@example.com SUPER_ADMIN
```

The roles are `STAFF`, `ADMIN` and `SUPER_ADMIN`.

| Area | URL | Who can open it |
|---|---|---|
| Admin | http://localhost:3000/admin | Staff roles; each page needs its own permission |
| Super admin | http://localhost:3000/super-admin | `SUPER_ADMIN` only |
| Vendor portal | http://localhost:3000/vendor | Approved vendors |

After that, a super admin can manage other admins from **Super admin → Admins**, so the script is only needed once.

Demo vendor logins after seeding: `attar@vendors.example.com`, `glow@vendors.example.com` and `lumiere@vendors.example.com`, all with password `Vendor@12345`.

---

## Checks before you commit

```powershell
# API
cd apps\api
.\.venv\Scripts\ruff.exe check . ; .\.venv\Scripts\ruff.exe format --check .
$env:TEST_DATABASE_URL = "postgresql+asyncpg://USER:PASS@localhost:5432/beauty_test"   # the name must end in _test
.\.venv\Scripts\pytest.exe

# Web
cd ..\web
npx tsc --noEmit
npm run lint
npm run check:contrast
npm run build
```

The test suite drops and recreates the `_test` database every run, so never point it at real data.

---

## New migration after changing a model

```powershell
cd apps\api
.\.venv\Scripts\alembic.exe revision --autogenerate -m "describe the change"
.\.venv\Scripts\alembic.exe upgrade head
```

New models must be imported in `apps/api/app/models.py`, or autogenerate won't see them.

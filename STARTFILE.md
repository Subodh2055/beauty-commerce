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

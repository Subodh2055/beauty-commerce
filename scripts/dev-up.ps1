<#
.SYNOPSIS
  One-shot local bootstrap: start Postgres + Redis in Docker, run migrations, seed the catalog.

.EXAMPLE
  .\scripts\dev-up.ps1            # data services + migrate + seed
  .\scripts\dev-up.ps1 -Full      # also start api, worker, n8n and web in Docker
#>
param([switch]$Full)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host "Created .env from .env.example" }

$compose = "docker compose --env-file .env -f infrastructure/docker/compose.dev.yml"

Write-Host "==> Starting postgres + redis" -ForegroundColor Cyan
Invoke-Expression "$compose up -d --wait postgres redis"

Write-Host "==> Running migrations" -ForegroundColor Cyan
Set-Location apps/api
if (-not (Test-Path .venv)) {
  python -m venv .venv
  .\.venv\Scripts\python.exe -m pip install --quiet -e ".[dev]"
}
.\.venv\Scripts\alembic.exe upgrade head

Write-Host "==> Seeding catalog" -ForegroundColor Cyan
.\.venv\Scripts\python.exe -m app.scripts.seed_catalog
Set-Location $root

if ($Full) {
  Write-Host "==> Starting api, worker, n8n, web in Docker" -ForegroundColor Cyan
  Invoke-Expression "$compose up -d --build api worker n8n web"
  Write-Host "Web: http://localhost:3000   API docs: http://localhost:8000/docs   n8n: http://localhost:5678"
} else {
  Write-Host ""
  Write-Host "Data services are up. Now run in two terminals:" -ForegroundColor Green
  Write-Host "  cd apps/api; .\.venv\Scripts\uvicorn.exe app.main:app --reload"
  Write-Host "  cd apps/web; npm run dev"
}

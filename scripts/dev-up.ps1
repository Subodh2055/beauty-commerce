<#
.SYNOPSIS
  One-shot local bootstrap: start Postgres + Redis in Docker, run migrations, seed the catalog.

.EXAMPLE
  .\scripts\dev-up.ps1            # data services + migrate + seed
  .\scripts\dev-up.ps1 -Full      # also start the full stack in Docker (via make.ps1 up)
#>
param([switch]$Full)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host "Created .env from .env.example" }

# Root docker-compose.yml includes infrastructure/docker/compose.dev.yml and reads .env.
$compose = "docker compose"

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
  Write-Host "==> Starting the full stack in Docker" -ForegroundColor Cyan
  & "$root\make.ps1" up
  Write-Host "Site (nginx): http://localhost   Web: http://localhost:3000   API docs: http://localhost:8000/docs   n8n: http://localhost:5678"
} else {
  Write-Host ""
  Write-Host "Data services are up. Now run in two terminals:" -ForegroundColor Green
  Write-Host "  cd apps/api; .\.venv\Scripts\uvicorn.exe app.main:app --reload"
  Write-Host "  cd apps/web; npm run dev"
}

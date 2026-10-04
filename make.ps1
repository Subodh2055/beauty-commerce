<#
.SYNOPSIS
  Windows equivalent of the Makefile: thin wrappers around Docker Compose.

.EXAMPLE
  .\make.ps1 up                                  # dev stack (docker-compose.yml)
  .\make.ps1 up -File docker-compose.prod.yml    # any target against prod
  .\make.ps1 logs api                            # follow one service (all if omitted)
  .\make.ps1 makemigration "add vendors"         # autogenerate an Alembic revision
#>
param(
  [Parameter(Mandatory, Position = 0)]
  [ValidateSet("up", "down", "logs", "migrate", "makemigration", "seed", "test", "lint")]
  [string]$Target,
  [Parameter(Position = 1)]
  [string]$Arg,
  [string]$File = "docker-compose.yml"
)

$ErrorActionPreference = "Stop"
# Absolute path, so this works from any directory.
$composeFile = Join-Path $PSScriptRoot $File

function Invoke-Compose {
  docker compose -f $composeFile @args
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

switch ($Target) {
  "up"      { Invoke-Compose up -d --build --wait }
  "down"    { Invoke-Compose down }
  "logs"    { if ($Arg) { Invoke-Compose logs -f --tail=200 $Arg } else { Invoke-Compose logs -f --tail=200 } }
  "migrate" { Invoke-Compose exec api alembic upgrade head }
  "makemigration" {
    if (-not $Arg) { Write-Error 'usage: .\make.ps1 makemigration "message"' }
    Invoke-Compose exec api alembic revision --autogenerate -m $Arg
  }
  "seed"    { Invoke-Compose exec api python -m app.scripts.seed_catalog }
  "test"    { Invoke-Compose exec api pytest }
  "lint" {
    Invoke-Compose exec api ruff check .
    Invoke-Compose exec api ruff format --check .
    Invoke-Compose exec web npm run lint
  }
}

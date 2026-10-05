# Thin wrappers around Docker Compose. On Windows without make: .\make.ps1 <target>.
#
#   make up                               dev stack (docker-compose.yml)
#   make up FILE=docker-compose.prod.yml  any target against prod
#   make logs s=api                       follow one service (all if omitted)
#   make makemigration m="add vendors"    autogenerate an Alembic revision

FILE ?= docker-compose.yml
COMPOSE = docker compose -f $(FILE)

.PHONY: up down logs migrate makemigration seed test lint

up:
	$(COMPOSE) up -d --build --wait

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200 $(s)

migrate:
	$(COMPOSE) exec api alembic upgrade head

makemigration:
	@test -n "$(m)" || (echo 'usage: make makemigration m="message"' && exit 1)
	$(COMPOSE) exec api alembic revision --autogenerate -m "$(m)"

seed:
	$(COMPOSE) exec api python -m app.scripts.seed_catalog

test:
	$(COMPOSE) exec api pytest

lint:
	$(COMPOSE) exec api ruff check .
	$(COMPOSE) exec api ruff format --check .
	$(COMPOSE) exec web npm run lint

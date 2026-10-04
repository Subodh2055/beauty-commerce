FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY app ./app
COPY alembic.ini ./
COPY alembic ./alembic

RUN pip install --upgrade pip && pip install -e ".[dev]"

EXPOSE 8000

# Healthchecks live in the compose files: this image also runs the Celery
# worker and beat, which don't serve HTTP, so a baked-in curl check would
# mark them unhealthy.

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

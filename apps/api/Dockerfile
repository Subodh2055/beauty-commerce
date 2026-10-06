# One image runs the API, the Celery worker and beat (the command differs).
#   dev  — editable install with test/lint tools, for compose.dev bind mounts
#   prod — non-editable install, no dev tools, runs as an unprivileged user

FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml alembic.ini ./
COPY app ./app
COPY alembic ./alembic

EXPOSE 8000

# Healthchecks live in the compose files: this image also runs the Celery
# worker and beat, which don't serve HTTP, so a baked-in curl check would
# mark them unhealthy.

# ---- dev -----------------------------------------------------------------------
FROM base AS dev
RUN pip install -e ".[dev]"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ---- prod ----------------------------------------------------------------------
FROM base AS prod
RUN pip install . \
    && groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /app/uploads \
    && chown -R app:app /app/uploads
# Uploads is the only writable path (a named volume inherits this ownership).
USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

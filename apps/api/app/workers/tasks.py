from app.core.logging import get_logger
from app.workers.celery_app import celery_app

log = get_logger(__name__)


@celery_app.task(name="system.ping")
def ping() -> str:
    """Smoke-test task to verify the worker/broker wiring."""
    log.info("ping_task")
    return "pong"

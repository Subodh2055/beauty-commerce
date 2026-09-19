"""Notification transport.

Order of preference (first configured wins):
1. n8n webhook  — POST the event, HMAC-signed, to N8N_WEBHOOK_URL. n8n fans out
   to email / SMS / FCM (see infrastructure/n8n/). This is the vault's design:
   FastAPI emits events; n8n owns delivery.
2. Direct SMTP  — send the email itself when SMTP_* is configured but n8n isn't.
3. Log          — dev fallback; the notification is written to the logs only.

Pure transport: no DB, no business logic. Every path is best-effort and returns
an outcome instead of raising, so a notification failure never breaks an order.
"""

import hashlib
import hmac
import json
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.shared.enums import NotificationChannel, NotificationStatus

log = get_logger(__name__)


@dataclass
class DispatchResult:
    channel: NotificationChannel
    status: NotificationStatus
    error: str | None = None


def sign(body: bytes) -> str:
    """HMAC-SHA256 signature n8n verifies before trusting the payload."""
    secret = settings.n8n_webhook_secret.encode()
    return hmac.new(secret, body, hashlib.sha256).hexdigest()


async def _dispatch_n8n(event: str, payload: dict) -> DispatchResult:
    body = json.dumps({"event": event, "data": payload}, default=str).encode()
    headers = {"Content-Type": "application/json", "X-Signature": sign(body)}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(settings.n8n_webhook_url, content=body, headers=headers)
        if resp.status_code >= 400:
            return DispatchResult(
                NotificationChannel.N8N, NotificationStatus.FAILED, f"HTTP {resp.status_code}"
            )
        return DispatchResult(NotificationChannel.N8N, NotificationStatus.SENT)
    except Exception as exc:  # noqa: BLE001 - best-effort
        return DispatchResult(NotificationChannel.N8N, NotificationStatus.FAILED, str(exc)[:200])


def _dispatch_smtp(recipient: str, subject: str, html: str, text: str) -> DispatchResult:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.email_from
    msg["To"] = recipient
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return DispatchResult(NotificationChannel.EMAIL, NotificationStatus.SENT)
    except Exception as exc:  # noqa: BLE001
        return DispatchResult(NotificationChannel.EMAIL, NotificationStatus.FAILED, str(exc)[:200])


async def dispatch(
    event: str, payload: dict, recipient: str | None, subject: str, html: str, text: str
) -> DispatchResult:
    if settings.n8n_webhook_url:
        return await _dispatch_n8n(event, payload)
    if settings.smtp_host and recipient:
        return _dispatch_smtp(recipient, subject, html, text)
    # Dev fallback — nothing configured.
    log.info("notification_logged", order_event=event, recipient=recipient, subject=subject)
    return DispatchResult(NotificationChannel.LOG, NotificationStatus.SENT)

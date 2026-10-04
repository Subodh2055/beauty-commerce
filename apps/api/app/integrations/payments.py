"""Payment provider interface and registry.

Each provider turns a checkout into a `PaymentInitiation` and turns its
callback into a verified `CallbackResult`. The payments module owns what happens
next (idempotency, amount checks, marking the order paid), so adding eSewa /
Khalti / Stripe means writing one class here — the orders and payments services
don't change.

- COD: always available; nothing to charge up front.
- Stub: a fake online gateway for development and tests, enabled with
  PAYMENT_STUB_ENABLED (refused in production). Its callbacks are HMAC-signed
  exactly like a real provider's, so the full verify → apply path is exercised.
- Anything else: `PaymentNotConfiguredError` (501) until real credentials exist.
"""

import hashlib
import hmac
import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Protocol

from app.core.config import settings
from app.core.exceptions import AppError, UnauthorizedError, ValidationFailedError
from app.shared.enums import PaymentMethod, PaymentStatus


class PaymentNotConfiguredError(AppError):
    status_code = 501
    code = "payment_not_configured"


@dataclass
class PaymentInitiation:
    status: PaymentStatus
    provider_ref: str | None = None
    redirect_url: str | None = None


@dataclass
class CallbackResult:
    event_id: str  # provider's unique id for this notification (idempotency key)
    provider_ref: str  # matches Payment.provider_ref
    succeeded: bool
    amount: Decimal
    raw: dict[str, Any] = field(default_factory=dict)


class PaymentProvider(Protocol):
    name: str

    def initiate(self, order_number: str, amount: Decimal, currency: str) -> PaymentInitiation: ...

    def parse_callback(self, payload: dict[str, Any], signature: str | None) -> CallbackResult: ...


class CashOnDelivery:
    name = "cod"

    def initiate(self, order_number: str, amount: Decimal, currency: str) -> PaymentInitiation:
        # Collected on delivery; nothing to charge now.
        return PaymentInitiation(status=PaymentStatus.PENDING, provider_ref=f"COD-{order_number}")

    def parse_callback(self, payload: dict[str, Any], signature: str | None) -> CallbackResult:
        raise ValidationFailedError("Cash on Delivery has no callbacks")


class StubGateway:
    """Behaves like a hosted-checkout gateway: returns a redirect, later POSTs a
    signed callback. Sign with `stub_signature(...)` (dev page / tests)."""

    name = "stub"

    def initiate(self, order_number: str, amount: Decimal, currency: str) -> PaymentInitiation:
        ref = f"STUB-{order_number}-{uuid.uuid4().hex[:8]}"
        return PaymentInitiation(
            status=PaymentStatus.PENDING,
            provider_ref=ref,
            redirect_url=f"{settings.frontend_url}/checkout/stub-pay?ref={ref}",
        )

    def parse_callback(self, payload: dict[str, Any], signature: str | None) -> CallbackResult:
        try:
            event_id = str(payload["event_id"])
            ref = str(payload["provider_ref"])
            status = str(payload["status"])
            amount = Decimal(str(payload["amount"]))
        except (KeyError, ArithmeticError) as exc:
            raise ValidationFailedError("Malformed payment callback") from exc
        expected = stub_signature(event_id, ref, status, amount)
        if not signature or not hmac.compare_digest(signature, expected):
            raise UnauthorizedError("Invalid payment callback signature")
        return CallbackResult(
            event_id=event_id,
            provider_ref=ref,
            succeeded=status == "succeeded",
            amount=amount,
            raw=dict(payload),
        )


def stub_signature(event_id: str, provider_ref: str, status: str, amount: Decimal) -> str:
    message = f"{event_id}|{provider_ref}|{status}|{Decimal(amount):.2f}".encode()
    return hmac.new(settings.payment_stub_secret.encode(), message, hashlib.sha256).hexdigest()


class _NotConfigured:
    def __init__(self, method: PaymentMethod) -> None:
        self.name = method.value.lower()
        self._method = method

    def initiate(self, order_number: str, amount: Decimal, currency: str) -> PaymentInitiation:
        raise PaymentNotConfiguredError(
            f"{self._method.value} online payment is not configured yet. "
            "Add merchant credentials to enable it. Cash on Delivery is available."
        )

    def parse_callback(self, payload: dict[str, Any], signature: str | None) -> CallbackResult:
        raise PaymentNotConfiguredError(f"{self._method.value} is not configured")


def provider_for(method: PaymentMethod) -> PaymentProvider:
    if method == PaymentMethod.COD:
        return CashOnDelivery()
    if settings.payment_stub_enabled:
        return StubGateway()
    return _NotConfigured(method)


def provider_by_name(name: str) -> PaymentProvider | None:
    """Resolve the provider named in a callback URL."""
    if name == StubGateway.name and settings.payment_stub_enabled:
        return StubGateway()
    return None


def initiate_payment(
    method: PaymentMethod, order_number: str, amount: Decimal, currency: str
) -> PaymentInitiation:
    return provider_for(method).initiate(order_number, amount, currency)

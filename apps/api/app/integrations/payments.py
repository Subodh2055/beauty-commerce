"""Payment provider interface.

Cash on Delivery is fully supported. eSewa / Khalti / Stripe require merchant
credentials and signed callback verification; their `initiate` raises a clear
error until configured (see docs/README.md and the vault Orders & Payments note).
Wire real providers here without touching the orders service.
"""

from dataclasses import dataclass
from decimal import Decimal

from app.core.exceptions import AppError
from app.shared.enums import PaymentMethod, PaymentStatus


class PaymentNotConfiguredError(AppError):
    status_code = 501
    code = "payment_not_configured"


@dataclass
class PaymentInitiation:
    status: PaymentStatus
    provider_ref: str | None = None
    redirect_url: str | None = None


def initiate_payment(
    method: PaymentMethod, order_number: str, amount: Decimal, currency: str
) -> PaymentInitiation:
    if method == PaymentMethod.COD:
        # Collected on delivery; nothing to charge now.
        return PaymentInitiation(status=PaymentStatus.PENDING, provider_ref=f"COD-{order_number}")

    raise PaymentNotConfiguredError(
        f"{method.value} online payment is not configured yet. "
        "Add merchant credentials to enable it. Cash on Delivery is available."
    )

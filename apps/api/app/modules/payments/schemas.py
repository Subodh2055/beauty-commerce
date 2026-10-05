import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.shared.enums import PaymentMethod

CallbackOutcome = Literal[
    "applied", "duplicate", "already_settled", "unknown_payment", "amount_mismatch"
]


class CallbackAck(BaseModel):
    """What we tell the provider. Always 200 for a verified callback (even one we
    ignore) so the provider stops retrying; the outcome is for logs/support."""

    received: bool = True
    outcome: CallbackOutcome


class PaymentMethodOut(BaseModel):
    """A checkout payment option and whether it can be used right now."""

    method: PaymentMethod
    label: str
    description: str
    available: bool
    # True when checkout hands the shopper to the provider's hosted page.
    online: bool


class StubPaymentOut(BaseModel):
    """What the dev stub payment page shows before the shopper approves."""

    provider_ref: str
    order_id: uuid.UUID
    order_number: str
    amount: Decimal
    currency: str
    status: str


class StubPaymentIn(BaseModel):
    provider_ref: str = Field(min_length=1, max_length=128)
    succeeded: bool = True


class StubPaymentResult(BaseModel):
    order_id: uuid.UUID
    outcome: CallbackOutcome

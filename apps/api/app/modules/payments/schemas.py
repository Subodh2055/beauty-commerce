from typing import Literal

from pydantic import BaseModel

CallbackOutcome = Literal[
    "applied", "duplicate", "already_settled", "unknown_payment", "amount_mismatch"
]


class CallbackAck(BaseModel):
    """What we tell the provider. Always 200 for a verified callback (even one we
    ignore) so the provider stops retrying; the outcome is for logs/support."""

    received: bool = True
    outcome: CallbackOutcome

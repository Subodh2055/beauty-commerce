import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.shared.enums import TicketPriority, TicketStatus

TicketCategory = Literal["ORDER", "PRODUCT", "PAYMENT", "ACCOUNT", "VENDOR", "OTHER"]


class TicketCreateIn(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    category: TicketCategory = "OTHER"
    order_id: uuid.UUID | None = None
    message: str = Field(min_length=1, max_length=10_000)


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)


class StaffMessageIn(MessageIn):
    internal: bool = False  # staff-only note, never shown to the requester


class TicketUpdateIn(BaseModel):
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    assigned_to: uuid.UUID | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_staff: bool
    is_internal: bool
    body: str
    created_at: datetime


class TicketSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reference: str
    subject: str
    category: str
    status: str
    priority: str
    order_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class TicketDetail(TicketSummary):
    messages: list[MessageOut]


class StaffTicketDetail(TicketDetail):
    requester_id: uuid.UUID
    assigned_to: uuid.UUID | None = None

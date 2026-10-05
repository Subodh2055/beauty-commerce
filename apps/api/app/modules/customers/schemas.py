import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.users.schemas import AddressOut


class CustomerRow(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None = None
    phone: str | None = None
    is_active: bool
    is_email_verified: bool
    is_vendor: bool
    created_at: datetime
    last_login_at: datetime | None = None
    orders_count: int
    total_spent: Decimal


class CustomerOrder(BaseModel):
    id: uuid.UUID
    order_number: str
    status: str
    total: Decimal
    currency: str
    created_at: datetime


class CustomerDetail(CustomerRow):
    addresses: list[AddressOut]
    recent_orders: list[CustomerOrder]
    returns_count: int
    open_tickets: int


class CustomerStatusIn(BaseModel):
    active: bool
    reason: str | None = Field(default=None, max_length=500)


CustomerSort = Literal["newest", "oldest", "spend", "orders"]

import uuid

from pydantic import BaseModel, ConfigDict, Field


class AddressIn(BaseModel):
    label: str = Field(default="Home", min_length=1, max_length=50)
    recipient_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=5, max_length=30)
    line1: str = Field(min_length=1, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=1, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str = Field(default="NP", min_length=2, max_length=2)
    is_default: bool = False


class AddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    label: str
    recipient_name: str
    phone: str
    line1: str
    line2: str | None = None
    city: str
    state: str | None = None
    postal_code: str | None = None
    country: str
    is_default: bool

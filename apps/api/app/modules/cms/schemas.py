import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BannerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    placement: str
    title: str
    subtitle: str | None = None
    image_url: str
    mobile_image_url: str | None = None
    link_url: str | None = None
    cta_label: str | None = None
    sort_order: int


class BannerAdminOut(BannerOut):
    is_active: bool
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    updated_at: datetime


class BannerWriteIn(BaseModel):
    placement: str = Field(default="home_hero", pattern=r"^[a-z][a-z0-9_]{1,29}$")
    title: str = Field(min_length=1, max_length=120)
    subtitle: str | None = Field(default=None, max_length=255)
    image_url: str = Field(min_length=1, max_length=500)
    mobile_image_url: str | None = Field(default=None, max_length=500)
    link_url: str | None = Field(default=None, max_length=500)
    cta_label: str | None = Field(default=None, max_length=40)
    sort_order: int = 0
    is_active: bool = True
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @model_validator(mode="after")
    def _window(self) -> "BannerWriteIn":
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self

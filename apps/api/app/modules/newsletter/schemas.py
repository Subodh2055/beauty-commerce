from pydantic import BaseModel, EmailStr, Field


class SubscribeIn(BaseModel):
    email: EmailStr
    source: str = Field(default="footer", pattern=r"^[a-z][a-z0-9_-]{1,39}$")


class UnsubscribeIn(BaseModel):
    token: str = Field(min_length=16, max_length=64)


class NewsletterAck(BaseModel):
    """Identical for new, existing and returning subscribers, so the endpoint
    can't be used to test whether an address is on the list."""

    message: str

import uuid

from pydantic import BaseModel, Field


class WishlistAddIn(BaseModel):
    product_id: uuid.UUID


class WishlistMergeIn(BaseModel):
    # Local (guest) product ids to fold into the account on login.
    product_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)

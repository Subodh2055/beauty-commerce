import uuid

from pydantic import BaseModel


class MediaAssetOut(BaseModel):
    id: uuid.UUID
    # `url`/`filename` keep the shape the admin uploader has always used.
    url: str  # the original; usable immediately
    filename: str
    status: str
    width: int | None = None
    height: int | None = None
    # WebP renditions by max width, e.g. {"400": "/uploads/x_400.webp", "full": ...}.
    # Empty until processing finishes.
    renditions: dict[str, str] = {}

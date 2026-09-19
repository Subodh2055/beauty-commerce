"""Image upload handling for the admin UI.

Stores the file under the configured upload dir with a random name and returns
its public URL (served by the /uploads static mount). Local-disk storage is the
V1 approach; swap the body of `save_upload` for S3/Blob later without touching
callers.
"""

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import ValidationFailedError

ALLOWED = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
}


async def save_upload(file: UploadFile) -> dict[str, str]:
    ext = ALLOWED.get((file.content_type or "").lower())
    if ext is None:
        raise ValidationFailedError("Only JPEG, PNG, WebP, GIF or AVIF images are allowed")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValidationFailedError(f"Image must be {settings.max_upload_mb} MB or smaller")
    if not data:
        raise ValidationFailedError("Empty file")

    name = f"{uuid.uuid4().hex}{ext}"
    dest = Path(settings.upload_dir)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / name).write_bytes(data)

    url = f"{settings.media_base_url.rstrip('/')}/uploads/{name}"
    return {"url": url, "filename": name}

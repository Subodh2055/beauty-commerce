"""Image uploads: validate + store the original synchronously, then resize and
convert to WebP in a Celery task so the request stays fast.

Storage is local disk under UPLOAD_DIR (served at /uploads); in Docker the api
and worker share that directory through the `uploads_data` volume. Swap
`_storage_dir`/`_url` for S3/R2 later without touching callers.
"""

import asyncio
import io
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ValidationFailedError
from app.core.logging import get_logger
from app.modules.media import repository as repo
from app.modules.media.models import MediaAsset
from app.modules.media.schemas import MediaAssetOut
from app.shared.enums import MediaStatus

log = get_logger(__name__)

ALLOWED = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
}
# Max widths of the WebP renditions; "full" is the original size, re-encoded.
RENDITION_WIDTHS = (400, 800, 1600)
WEBP_QUALITY = 82
MAX_PIXELS = 40_000_000  # refuse decompression bombs before resizing


def _storage_dir() -> Path:
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _url(name: str) -> str:
    return f"{settings.media_base_url.rstrip('/')}/uploads/{name}"


def to_out(asset: MediaAsset) -> MediaAssetOut:
    return MediaAssetOut(
        id=asset.id,
        url=_url(asset.filename),
        filename=asset.filename,
        status=asset.status,
        width=asset.width,
        height=asset.height,
        renditions=dict(asset.renditions or {}),
    )


def enqueue_processing(asset_id: uuid.UUID) -> None:
    """Hand the asset to the worker. Best-effort: if the broker is down the asset
    stays PENDING and the `media-retry-pending` beat job picks it up later."""
    from app.workers.celery_app import celery_app

    try:
        # ignore_result: nobody waits for this task's result, and without it the Redis
        # result backend retries its connection (~20 times) before giving up, so a
        # broker outage would hold the upload request open instead of failing fast.
        celery_app.send_task(
            "media.process_image", args=[str(asset_id)], retry=False, ignore_result=True
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("media_enqueue_failed", asset_id=str(asset_id), error=str(exc))


async def upload(
    db: AsyncSession, file: UploadFile, *, owner_id: uuid.UUID, vendor_id: uuid.UUID | None
) -> MediaAssetOut:
    ext = ALLOWED.get((file.content_type or "").lower())
    if ext is None:
        raise ValidationFailedError("Only JPEG, PNG, WebP, GIF or AVIF images are allowed")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValidationFailedError(f"Image must be {settings.max_upload_mb} MB or smaller")
    if not data:
        raise ValidationFailedError("Empty file")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            width, height = probe.size
            probe.verify()  # catches truncated/corrupt files and non-images with an image MIME
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise ValidationFailedError("That file is not a readable image") from exc
    if width * height > MAX_PIXELS:
        raise ValidationFailedError("Image dimensions are too large")

    name = f"{uuid.uuid4().hex}{ext}"
    (_storage_dir() / name).write_bytes(data)

    asset = MediaAsset(
        owner_id=owner_id,
        vendor_id=vendor_id,
        filename=name,
        content_type=file.content_type or "",
        size_bytes=len(data),
        width=width,
        height=height,
        status=MediaStatus.PENDING,
        renditions={},
    )
    db.add(asset)
    await db.commit()
    # After commit, so the worker can see the row. Off the event loop: publishing is a
    # blocking network call and must not stall other requests if the broker is slow.
    await asyncio.to_thread(enqueue_processing, asset.id)
    return to_out(asset)


def _render(src: Path, stem: str) -> dict[str, str]:
    """Write WebP renditions of `src`; returns {"400": url, ..., "full": url}."""
    out: dict[str, str] = {}
    with Image.open(src) as opened:
        img = ImageOps.exif_transpose(opened)  # respect camera orientation, drop EXIF
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert(
                "RGBA" if "transparency" in img.info or img.mode in ("LA", "P") else "RGB"
            )
        for width in RENDITION_WIDTHS:
            if width >= img.width:
                continue  # never upscale
            height = round(img.height * width / img.width)
            name = f"{stem}_{width}.webp"
            img.resize((width, height), Image.Resampling.LANCZOS).save(
                src.with_name(name), "WEBP", quality=WEBP_QUALITY, method=4
            )
            out[str(width)] = _url(name)
        full = f"{stem}.webp" if src.suffix != ".webp" else f"{stem}_full.webp"
        img.save(src.with_name(full), "WEBP", quality=WEBP_QUALITY, method=4)
        out["full"] = _url(full)
    return out


async def process_asset(db: AsyncSession, asset_id: uuid.UUID) -> str:
    """Worker entry point. Idempotent: READY/FAILED assets are left alone, and a
    row already being processed by another worker is skipped (SKIP LOCKED)."""
    asset = await repo.get_for_update(db, asset_id)
    if asset is None or asset.status != MediaStatus.PENDING:
        return "skipped"  # the caller's session ends right after, releasing the lock
    src = _storage_dir() / asset.filename
    try:
        asset.renditions = _render(src, src.stem)
        asset.status = MediaStatus.READY
        asset.error = None
    except Exception as exc:  # noqa: BLE001 — record any decode/IO failure on the row
        log.warning("media_process_failed", asset_id=str(asset_id), error=str(exc))
        asset.status = MediaStatus.FAILED
        asset.error = str(exc)[:300]
    asset.processed_at = datetime.now(UTC)
    await db.commit()
    return asset.status


async def retry_pending(db: AsyncSession, older_than_minutes: int = 5) -> int:
    ids = await repo.stale_pending_ids(
        db, datetime.now(UTC) - timedelta(minutes=older_than_minutes)
    )
    for asset_id in ids:
        enqueue_processing(asset_id)
    return len(ids)

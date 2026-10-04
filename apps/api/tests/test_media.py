"""Image uploads and the WebP resize task."""

import io

import pytest
from httpx import AsyncClient
from PIL import Image

from app.core.config import settings
from app.modules.media import service as media_service
from app.modules.media.models import MediaAsset
from tests.factories import auth, make_user, make_vendor

pytestmark = pytest.mark.db


def _png(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (180, 120, 140)).save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture
def uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    queued: list[str] = []
    monkeypatch.setattr(media_service, "enqueue_processing", lambda aid: queued.append(str(aid)))
    return tmp_path, queued


async def test_upload_then_process_into_webp_renditions(api: AsyncClient, db, uploads) -> None:
    folder, queued = uploads
    admin = await make_user(db, "ADMIN")
    res = await api.post(
        "/api/v1/admin/uploads",
        files={"file": ("bottle.png", _png(1000, 1250), "image/png")},
        headers=auth(admin),
    )
    assert res.status_code == 201, res.text
    out = res.json()
    # Same shape the admin uploader always used, plus status.
    assert out["url"] == f"/uploads/{out['filename']}" and out["status"] == "PENDING"
    assert queued == [out["id"]]  # enqueued after commit

    status = await media_service.process_asset(db, out["id"])
    assert status == "READY"
    asset = await db.get(MediaAsset, out["id"])
    stem = out["filename"].rsplit(".", 1)[0]
    assert set(asset.renditions) == {"400", "800", "full"}  # 1600 > 1000: never upscaled
    assert asset.renditions["400"] == f"/uploads/{stem}_400.webp"
    with Image.open(folder / f"{stem}_400.webp") as small:
        assert small.format == "WEBP" and small.size == (400, 500)
    with Image.open(folder / f"{stem}.webp") as full:
        assert full.size == (1000, 1250)

    # Idempotent: a retried task doesn't redo work.
    assert await media_service.process_asset(db, out["id"]) == "skipped"
    polled = await api.get(f"/api/v1/media/{out['id']}", headers=auth(admin))
    assert polled.json()["status"] == "READY"


async def test_rejects_non_images_and_spoofed_types(api: AsyncClient, db, uploads) -> None:
    admin = await make_user(db, "ADMIN")
    pdf = await api.post(
        "/api/v1/admin/uploads",
        files={"file": ("x.pdf", b"%PDF-1.7", "application/pdf")},
        headers=auth(admin),
    )
    assert pdf.status_code == 422
    spoofed = await api.post(
        "/api/v1/admin/uploads",
        files={"file": ("evil.png", b"<?php echo 1; ?>", "image/png")},
        headers=auth(admin),
    )
    assert spoofed.status_code == 422


async def test_corrupt_file_on_disk_marks_failed(db, uploads) -> None:
    folder, _ = uploads
    asset = MediaAsset(filename="broken.png", content_type="image/png", size_bytes=3)
    db.add(asset)
    await db.flush()
    (folder / "broken.png").write_bytes(b"nope")
    assert await media_service.process_asset(db, asset.id) == "FAILED"
    assert asset.error


async def test_vendor_uploads_are_tagged_and_private(api: AsyncClient, db, uploads) -> None:
    vendor, owner = await make_vendor(db)
    _, other_owner = await make_vendor(db)
    res = await api.post(
        "/api/v1/vendor/uploads",
        files={"file": ("v.png", _png(300, 300), "image/png")},
        headers=auth(owner),
    )
    assert res.status_code == 201
    asset = await db.get(MediaAsset, res.json()["id"])
    assert asset.vendor_id == vendor.id
    peek = await api.get(f"/api/v1/media/{asset.id}", headers=auth(other_owner))
    assert peek.status_code == 404


async def test_customers_cannot_upload(api: AsyncClient, db, uploads) -> None:
    customer = await make_user(db)
    res = await api.post(
        "/api/v1/admin/uploads",
        files={"file": ("x.png", _png(10, 10), "image/png")},
        headers=auth(customer),
    )
    assert res.status_code == 403

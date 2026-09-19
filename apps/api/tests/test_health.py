from httpx import AsyncClient


async def test_liveness(client: AsyncClient) -> None:
    res = await client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": None, "redis": None}
    assert "x-request-id" in res.headers


async def test_request_id_is_echoed(client: AsyncClient) -> None:
    res = await client.get("/api/v1/health", headers={"X-Request-ID": "abc-123"})
    assert res.headers["x-request-id"] == "abc-123"


async def test_404_uses_error_envelope(client: AsyncClient) -> None:
    res = await client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    body = res.json()
    assert body["error"]["code"] == "not_found"
    assert body["request_id"]

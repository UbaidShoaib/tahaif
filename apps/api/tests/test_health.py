from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.api.v1.endpoints import health


@pytest.mark.asyncio
async def test_healthz(client: AsyncClient) -> None:
    response = await client.get("/api/v1/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_readyz(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    redis = AsyncMock()
    monkeypatch.setattr(health, "get_redis", lambda: redis)
    response = await client.get("/api/v1/readyz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "redis": "ok"}


@pytest.mark.asyncio
async def test_readyz_redis_down(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    redis = AsyncMock()
    redis.ping.side_effect = ConnectionError("refused")
    monkeypatch.setattr(health, "get_redis", lambda: redis)
    response = await client.get("/api/v1/readyz")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "ok", "redis": "error"}

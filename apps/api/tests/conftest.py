import os

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/tahaif_test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")

from app.main import app  # noqa: E402 — env vars must be set first


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

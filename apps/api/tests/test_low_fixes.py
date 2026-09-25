"""Account erasure removes saved addresses; rate limits are shared through Redis."""

import uuid

import pytest
import redis
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from httpx import AsyncClient
from slowapi.errors import RateLimitExceeded
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from app.core.config import get_settings
from app.core.rate_limit import build_limiter
from app.core.security import hash_password
from app.models.address import Address
from app.models.user import UserRole
from app.repositories.user_repository import UserRepository

# ── Account erasure ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_account_deletion_removes_saved_addresses(client: AsyncClient, db: AsyncSession) -> None:
    email = f"erase_{uuid.uuid4().hex[:8]}@example.com"
    user = await UserRepository(db).create(email=email, password_hash=hash_password("Password1"), role=UserRole.customer)
    user_id = user.id
    await db.commit()
    token = (await client.post("/api/v1/auth/login", json={"email": email, "password": "Password1"})).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    for name in ("Ammi Jaan", "Khala"):
        created = await client.post("/api/v1/me/addresses", headers=headers, json={
            "recipient_name": name, "recipient_phone": "+923001234567", "line1": "12 Main Boulevard", "city_name": "Lahore",
        })
        assert created.status_code == 201

    assert (await client.delete("/api/v1/me", headers=headers)).status_code == 204

    remaining = await db.execute(select(func.count()).select_from(Address).where(Address.user_id == user_id))
    assert remaining.scalar_one() == 0
    assert (await client.get("/api/v1/me/addresses", headers=headers)).status_code == 401


# ── Shared rate limits ────────────────────────────────────────────────────────


def _app_with(limiter_route: str, limit: str) -> tuple[FastAPI, object]:
    """A tiny app whose limiter talks to the real Redis, like one API worker."""
    limiter = build_limiter(str(get_settings().redis_url))
    app = FastAPI()
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def _limited(_r: Request, _e: RateLimitExceeded) -> JSONResponse:
        return JSONResponse({"detail": "limited"}, status_code=429)

    @app.get(limiter_route)
    @limiter.limit(limit)
    async def _route(request: Request) -> dict[str, bool]:  # noqa: ARG001 — slowapi needs request
        return {"ok": True}

    return app, limiter


def _redis_available() -> bool:
    try:
        return bool(redis.Redis.from_url(str(get_settings().redis_url), socket_connect_timeout=1).ping())
    except redis.RedisError:
        return False


@pytest.mark.skipif(not _redis_available(), reason="Redis not running")
def test_limit_is_shared_between_workers() -> None:
    route = f"/probe-{uuid.uuid4().hex[:8]}"
    worker_a, _ = _app_with(route, "2/minute")
    worker_b, _ = _app_with(route, "2/minute")

    with TestClient(worker_a) as a, TestClient(worker_b) as b:
        assert a.get(route).status_code == 200
        assert b.get(route).status_code == 200
        # Third request overall: blocked on either worker because counts live in Redis.
        assert a.get(route).status_code == 429
        assert b.get(route).status_code == 429

    keys = redis.Redis.from_url(str(get_settings().redis_url)).keys(f"*tahaif-rl/*{route}/*")
    assert keys, "limit counters should be stored in Redis under the tahaif-rl prefix"


def test_limiter_keeps_serving_when_redis_is_down() -> None:
    limiter = build_limiter("redis://127.0.0.1:1/0")  # nothing listens on port 1
    app = FastAPI()
    app.state.limiter = limiter

    @app.get("/probe")
    @limiter.limit("5/minute")
    async def _route(request: Request) -> dict[str, bool]:  # noqa: ARG001
        return {"ok": True}

    with TestClient(app) as c:
        assert c.get("/probe").status_code == 200

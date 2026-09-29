"""Test configuration.

Strategy: asyncpg connections are bound to the event loop they were created in.
pytest-asyncio gives each test (function scope) its own event loop, which conflicts
with a session-scoped pool. We solve this by using NullPool per test — each test
creates its own connection, uses it, and discards it. Tables are set up via
a synchronous asyncio.run() call so no loop is involved at session scope.

Rate limiting: set TESTING=1 so the slowapi limiter is constructed with enabled=False.
This must be set BEFORE any app module is imported.
"""

import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://tahaif_user:tahaif_dev_password@localhost:5433/tahaif_test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-chars-long!!")
os.environ.setdefault("RESEND_API_KEY", "")
os.environ["TESTING"] = "1"  # disables rate limiting

import asyncio  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import NullPool, text  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

import app.models as _models  # noqa: F401, E402 — registers all ORM metadata
from alembic import command  # noqa: E402
from app.core.db import get_db  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402

TEST_DB_URL = os.environ["DATABASE_URL"]


# ── Schema setup (sync, no pytest-asyncio event loop involved) ─────────────────
# The schema is built by running the real Alembic migrations, so tests see the
# same tables production does (including raw-SQL tables such as
# notifications_outbox and audit_logs that have no ORM model).

_API_DIR = Path(__file__).resolve().parents[1]


def _run(coro):  # type: ignore[no-untyped-def]
    asyncio.run(coro)


async def _reset_schema() -> None:
    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await engine.dispose()


def _migrate() -> None:
    cfg = Config(str(_API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_API_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", TEST_DB_URL)
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session", autouse=True)
def _setup_db() -> None:  # type: ignore[misc]
    _run(_reset_schema())
    _migrate()
    yield  # type: ignore[misc]
    _run(_reset_schema())


# ── Per-test Redis client ─────────────────────────────────────────────────────
# get_redis() caches one client per process; its connections are bound to the
# event loop that opened them, and each test runs in a fresh loop.

@pytest.fixture(autouse=True)
def _fresh_redis_client() -> None:
    from app.core import redis_client

    redis_client._redis = None


# ── Per-test DB session (NullPool = no cross-loop connection sharing) ─────────

@pytest_asyncio.fixture
async def db(_setup_db: None) -> AsyncSession:  # type: ignore[misc]
    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool, echo=False)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session  # type: ignore[misc]
        # No rollback — each test uses unique data; _setup_db drops all between sessions
    await engine.dispose()


# ── HTTPX client with DB override ────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncClient:  # type: ignore[misc]
    async def _override_db() -> AsyncSession:  # type: ignore[misc]
        from fastapi import HTTPException

        try:
            yield db  # type: ignore[misc]
            await db.commit()
            db.expire_all()
        except HTTPException:
            # Mirror production get_db: commit on HTTPException so deliberate
            # mutations (e.g. family revocation on theft detection) are persisted.
            await db.commit()
            db.expire_all()
            raise
        except Exception:
            await db.rollback()
            raise

    fastapi_app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as ac:
        yield ac  # type: ignore[misc]
    fastapi_app.dependency_overrides.clear()

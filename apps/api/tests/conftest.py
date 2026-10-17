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
# Most suites check out as freshly made (unverified) users; test_email_verification
# turns the gate back on where it is under test.
os.environ.setdefault("REQUIRE_VERIFIED_EMAIL_FOR_CHECKOUT", "false")
os.environ.setdefault("WHATSAPP_API_ENABLED", "true")  # exercise the automatic queueing paths

import uuid  # noqa: E402

_BASE_DB_URL = os.environ["DATABASE_URL"]

# The suite drops every table. Refuse any database not named *_test, so a
# DATABASE_URL loaded from .env can never wipe the dev (or any real) database.
if not _BASE_DB_URL.rsplit("/", 1)[-1].split("?", 1)[0].endswith("_test"):
    raise RuntimeError(f"Tests drop all tables; refusing to run against non-test database {_BASE_DB_URL.rsplit('@', 1)[-1]!r}")

# Each pytest run gets its own throwaway database (tahaif_test -> tahaif_<id>_test).
# Runs used to share one database, so when two overlapped (IDE + terminal, or
# parallel agents) one run's teardown dropped the tables the other was using.
_server_url, _base_name = _BASE_DB_URL.split("?", 1)[0].rsplit("/", 1)
_RUN_DB = f"{_base_name.removesuffix('_test')}_{uuid.uuid4().hex[:8]}_test"
TEST_DB_URL = f"{_server_url}/{_RUN_DB}"
# Anything that reads settings (and opens its own engine) must hit the same database.
os.environ["DATABASE_URL"] = TEST_DB_URL

import asyncio  # noqa: E402
from collections.abc import AsyncIterator  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
import sqlalchemy as sa  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import NullPool  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

import app.models as _models  # noqa: F401, E402 — registers all ORM metadata
from app.core.db import get_db  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.models.base import Base  # noqa: E402

# ── Table setup (sync, no pytest-asyncio event loop involved) ─────────────────

def _run(coro):  # type: ignore[no-untyped-def]
    asyncio.run(coro)


async def _admin_execute(sql: str) -> None:
    """CREATE/DROP DATABASE: run from the server's maintenance database, outside a transaction."""
    engine = create_async_engine(f"{_server_url}/postgres", poolclass=NullPool, isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        await conn.execute(sa.text(sql))
    await engine.dispose()


async def _create_tables() -> None:
    await _admin_execute(f'CREATE DATABASE "{_RUN_DB}"')
    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


async def _drop_tables() -> None:
    await _admin_execute(f'DROP DATABASE IF EXISTS "{_RUN_DB}" WITH (FORCE)')


@pytest.fixture(scope="session", autouse=True)
def _setup_db() -> None:  # type: ignore[misc]
    _run(_create_tables())
    yield  # type: ignore[misc]
    _run(_drop_tables())


# ── Reset cached redis client between tests ───────────────────────────────────
# app.core.redis_client memoizes a module-level Redis instance bound to whichever
# event loop first created it. pytest-asyncio gives each test its own event loop,
# so a connection cached by an earlier test breaks later tests with
# "Future attached to a different loop" / "Event loop is closed". Force a fresh
# client per test, same NullPool-per-test rationale as the DB engine above.
@pytest.fixture(autouse=True)
def _reset_redis_client() -> None:  # type: ignore[misc]
    import app.core.redis_client as redis_client

    redis_client._redis = None
    yield  # type: ignore[misc]
    redis_client._redis = None


# ── Per-test DB session (NullPool = no cross-loop connection sharing) ─────────

@pytest_asyncio.fixture
async def db(_setup_db: None) -> AsyncSession:  # type: ignore[misc]
    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool, echo=False)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session  # type: ignore[misc]
        # No rollback — each test uses unique data; the run's database is dropped at the end
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


# notifications_outbox is created by Alembic migration 0005 and has no ORM
# model, so create_all does not build it. Tests that write to it request this
# fixture, which builds it with the same column types and drops it afterwards.
_DDL = [
    "DO $$ BEGIN CREATE TYPE notification_channel AS ENUM ('email','sms','whatsapp'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    "DO $$ BEGIN CREATE TYPE notification_status AS ENUM ('pending','sent','failed'); "
    "EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    """
    CREATE TABLE IF NOT EXISTS notifications_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel notification_channel NOT NULL,
        to_address VARCHAR(255) NOT NULL,
        template VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status notification_status NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
]
@pytest_asyncio.fixture
async def outbox(db: AsyncSession) -> AsyncIterator[AsyncSession]:
    for stmt in _DDL:
        await db.execute(sa.text(stmt))
    await db.commit()
    yield db
    await db.rollback()
    await db.execute(sa.text("DROP TABLE IF EXISTS notifications_outbox"))
    await db.execute(sa.text("DROP TYPE IF EXISTS notification_status"))
    await db.execute(sa.text("DROP TYPE IF EXISTS notification_channel"))
    await db.commit()

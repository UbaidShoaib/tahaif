import uuid
from collections.abc import AsyncGenerator

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()

_connect_args: dict[str, object] = {}
if settings.db_pgbouncer:
    # Transaction poolers hand each transaction to a different server connection,
    # so disable asyncpg's statement cache and give prepared statements unique names.
    _connect_args = {
        "statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
    }

engine = create_async_engine(
    str(settings.database_url),
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except HTTPException:
            # HTTPExceptions are deliberate, controlled responses. Commit any
            # DB mutations that already ran (e.g. revoking a stolen token family
            # before returning 401). If nothing was flushed, this is a no-op.
            await session.commit()
            raise
        except Exception:
            await session.rollback()
            raise

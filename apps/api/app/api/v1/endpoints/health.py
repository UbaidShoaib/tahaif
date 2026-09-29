from typing import Annotated

import sqlalchemy as sa
import structlog
from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.redis_client import get_redis

router = APIRouter()
logger = structlog.get_logger()


class HealthResponse(BaseModel):
    status: str


class ReadinessResponse(BaseModel):
    status: str
    database: str
    redis: str


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/readyz", response_model=ReadinessResponse)
async def readyz(
    response: Response, db: Annotated[AsyncSession, Depends(get_db)]
) -> ReadinessResponse:
    """Liveness plus dependency checks: 503 when Postgres or Redis is unreachable."""
    database = "ok"
    try:
        await db.execute(sa.text("SELECT 1"))
    except Exception as exc:
        database = "error"
        await logger.aerror("readyz_database_failed", exc=str(exc))

    redis = "ok"
    try:
        await get_redis().ping()
    except Exception as exc:
        redis = "error"
        await logger.aerror("readyz_redis_failed", exc=str(exc))

    ready = database == "ok" and redis == "ok"
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(status="ok" if ready else "error", database=database, redis=redis)

"""Internal endpoints for schedulers that can only make HTTP calls (e.g. GitHub Actions cron)."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.workers.jobs import JOBS

router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False)


class JobResult(BaseModel):
    job: str
    processed: int


def _require_jobs_token(authorization: Annotated[str | None, Header()] = None) -> None:
    token = get_settings().jobs_token
    if not token:
        # Endpoint is off unless a token is configured.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    expected = f"Bearer {token}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid job token")


@router.post(
    "/jobs/{job}",
    response_model=JobResult,
    dependencies=[Depends(_require_jobs_token)],
)
async def run_job(job: str, db: Annotated[AsyncSession, Depends(get_db)]) -> JobResult:
    if job not in JOBS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown job")
    processed = await JOBS[job](db)
    return JobResult(job=job, processed=processed)

"""Registry of scheduled background jobs.

Each job takes a DB session and returns the number of rows it processed. Jobs are
safe to run concurrently or repeatedly: the outbox drain uses FOR UPDATE SKIP LOCKED
and the FX refresh upserts.

Triggered by a scheduler, either as a one-off process (`python -m app.workers.run`)
or over HTTP (POST /api/v1/internal/jobs/{job}) for hosts without a job runner.
"""

from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.workers.fx_rate_worker import refresh_fx_rates
from app.workers.outbox_worker import drain_pending

Job = Callable[[AsyncSession], Awaitable[int]]

JOBS: dict[str, Job] = {
    "outbox": drain_pending,  # every 5–15 min
    "fx": refresh_fx_rates,  # daily 00:00 UTC
}

"""Run one background job and exit.

Usage (from apps/api, or the API container):
    python -m app.workers.run outbox
    python -m app.workers.run fx

Meant for cron-style schedulers: Cloud Run Jobs, Render Cron, Fly scheduled
Machines, or a host crontab running `docker compose exec api ...`.
"""

import asyncio
import sys

import structlog

from app.core.db import AsyncSessionLocal, engine
from app.workers.jobs import JOBS

logger = structlog.get_logger()


async def run_job(name: str) -> int:
    job = JOBS[name]
    async with AsyncSessionLocal() as session:
        processed = await job(session)
    await engine.dispose()
    await logger.ainfo("job_finished", job=name, processed=processed)
    return processed


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in JOBS:
        print(f"usage: python -m app.workers.run {{{'|'.join(JOBS)}}}", file=sys.stderr)
        return 2
    asyncio.run(run_job(argv[0]))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))

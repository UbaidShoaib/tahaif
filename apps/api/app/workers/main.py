"""arq worker: sends queued notifications and refreshes FX rates.

Run with:  arq app.workers.main.WorkerSettings
Cron jobs are unique across workers (arq takes a Redis lock), so running one
worker per API replica does not send anything twice.
"""

from typing import Any

import structlog
from arq import cron
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.core.db import AsyncSessionLocal
from app.services.reminder_service import send_due_reminders, today_utc
from app.workers.fx_rate_worker import refresh_fx_rates
from app.workers.outbox_worker import drain_pending

logger = structlog.get_logger()


async def drain_outbox(ctx: dict[Any, Any], *_args: Any, **_kwargs: Any) -> int:  # noqa: ARG001 — arq passes ctx
    async with AsyncSessionLocal() as db:
        sent = await drain_pending(db)
    if sent:
        await logger.ainfo("outbox_drained", processed=sent)
    return sent


async def send_reminders(ctx: dict[Any, Any], *_args: Any, **_kwargs: Any) -> int:  # noqa: ARG001 — arq passes ctx
    async with AsyncSessionLocal() as db:
        return await send_due_reminders(db, today_utc())


async def refresh_fx(ctx: dict[Any, Any], *_args: Any, **_kwargs: Any) -> int:  # noqa: ARG001 — arq passes ctx
    async with AsyncSessionLocal() as db:
        return await refresh_fx_rates(db)


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(str(get_settings().redis_url))
    functions: list[Any] = []
    cron_jobs = [
        # Confirmation emails/SMS: every 15 seconds.
        cron(drain_outbox, second={0, 15, 30, 45}, run_at_startup=True, timeout=120),
        # Daily FX refresh at 01:00 UTC, plus once on start so a fresh deploy has rates.
        cron(refresh_fx, hour={1}, minute={0}, run_at_startup=True, timeout=120),
        # Occasion reminders at 07:00 UTC: morning in the UK, midday in the Gulf and
        # Pakistan, early for North America. Each reminder is sent once (logged).
        cron(send_reminders, hour={7}, minute={0}, timeout=600),
    ]
    job_timeout = 300

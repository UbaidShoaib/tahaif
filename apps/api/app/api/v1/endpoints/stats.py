import uuid

from fastapi import APIRouter, Query, Response

from app.core.deps import DB
from app.schemas.stats import OnTimeStats
from app.services import stats_service

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/on-time", response_model=OnTimeStats)
async def on_time(
    db: DB,
    response: Response,
    vendor_id: uuid.UUID | None = Query(default=None),  # noqa: B008
) -> OnTimeStats:
    """Share of deliveries in the last 90 days that arrived on or before the
    chosen day, overall or for one vendor. `on_time_percent` is null until
    there are enough deliveries to be meaningful."""
    response.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=600"
    return await stats_service.on_time_stats(db, vendor_id)

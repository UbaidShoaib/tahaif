import uuid

from fastapi import APIRouter, Query, Response

from app.core.deps import DB
from app.schemas.stats import OnTimeStats, UpcomingOccasion
from app.services import stats_service
from app.services.occasion_calendar import upcoming_occasions
from app.services.reminder_service import today_utc

router = APIRouter(tags=["stats"])


@router.get("/stats/on-time", response_model=OnTimeStats)
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


@router.get("/calendar/upcoming", response_model=list[UpcomingOccasion])
async def calendar_upcoming(
    response: Response,
    country: str | None = Query(default=None, pattern=r"^[A-Z]{2}$", examples=["GB"]),
    limit: int = Query(default=3, ge=1, le=6),
) -> list[UpcomingOccasion]:
    """Next Eid and Mother's Day dates for buyers in `country` (Mother's Day differs by country)."""
    response.headers["Cache-Control"] = "public, max-age=3600"
    today = today_utc()
    return [
        UpcomingOccasion(slug=slug, name=name, date=when, days_away=(when - today).days)
        for slug, name, when in upcoming_occasions(country, today, limit)
    ]

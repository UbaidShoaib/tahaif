"""Delivery slot validation: lead times and same-day cutoffs."""

from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException, status

from app.models.catalog import ProductCity


def get_earliest_delivery_date(pc: ProductCity, now: datetime | None = None) -> date:
    """Return the earliest permissible delivery date for a city–product pairing."""
    now = now or datetime.now(UTC)
    lead_hours = pc.lead_time_hours or 24

    earliest_dt = now + timedelta(hours=lead_hours)

    # If same-day cutoff has passed today, advance by one calendar day
    if pc.same_day_cutoff and lead_hours <= 24:
        cutoff_today = now.replace(
            hour=pc.same_day_cutoff.hour,
            minute=pc.same_day_cutoff.minute,
            second=0,
            microsecond=0,
        )
        if now >= cutoff_today:
            earliest_dt = now + timedelta(days=1)

    return earliest_dt.date()


def validate_delivery_date(
    pc: ProductCity,
    requested: date,
    product_name: str,
    now: datetime | None = None,
) -> None:
    """Raise 422 if requested date violates lead-time or cutoff constraints."""
    earliest = get_earliest_delivery_date(pc, now)
    if requested < earliest:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"'{product_name}' cannot be delivered on {requested}. "
                f"Earliest available date is {earliest} "
                f"(lead time: {pc.lead_time_hours}h)."
            ),
        )

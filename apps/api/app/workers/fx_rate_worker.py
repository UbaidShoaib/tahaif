"""Daily FX rate refresh worker: fetches 8 currencies from Open Exchange Rates."""

import uuid
from datetime import UTC, datetime

import structlog
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.catalog import FxRate, FxRateSource

logger = structlog.get_logger()

_CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD", "AED", "SAR"]
_BASE = "PKR"


async def refresh_fx_rates(db: AsyncSession) -> int:
    """Fetch live rates and upsert into fx_rates. Returns number of rows updated."""
    settings = get_settings()
    if not settings.open_exchange_rates_app_id:
        await logger.awarning("fx_rate_refresh_skipped", reason="no app_id configured")
        return 0

    url = "https://openexchangerates.org/api/latest.json"
    params = {
        "app_id": settings.open_exchange_rates_app_id,
        "base": "USD",
        "symbols": ",".join([_BASE, *_CURRENCIES]),
    }

    async with AsyncClient(timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    rates: dict[str, float] = data.get("rates", {})
    pkr_per_usd = rates.get(_BASE)
    if not pkr_per_usd:
        await logger.aerror("fx_rate_refresh_failed", reason="PKR rate missing from response")
        return 0

    now = datetime.now(UTC)
    updated = 0

    for currency in _CURRENCIES:
        usd_per_currency = rates.get(currency)
        if not usd_per_currency:
            continue

        # Convert: 1 PKR = (1/pkr_per_usd) USD = (usd_per_currency/pkr_per_usd) <currency>
        # So 1 PKR in <currency> = usd_per_currency / pkr_per_usd
        from decimal import Decimal
        rate = Decimal(str(usd_per_currency / pkr_per_usd)).quantize(Decimal("0.000001"))

        existing = (await db.execute(
            select(FxRate).where(
                FxRate.base_currency == _BASE,
                FxRate.quote_currency == currency,
                FxRate.source == FxRateSource.auto,
            )
        )).scalar_one_or_none()

        if existing:
            existing.rate = rate
            existing.fetched_at = now
        else:
            db.add(FxRate(
                id=uuid.uuid4(),
                base_currency=_BASE,
                quote_currency=currency,
                rate=rate,
                source=FxRateSource.auto,
                fetched_at=now,
            ))

        updated += 1

    await db.commit()
    await logger.ainfo("fx_rates_refreshed", count=updated)
    return updated

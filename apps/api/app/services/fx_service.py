"""FX conversion service: fetch live rates and convert PKR amounts."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import FxRate, FxRateSource


async def get_rate(db: AsyncSession, quote_currency: str) -> Decimal:
    """Return the PKR→quote_currency rate (manual override wins over auto)."""
    if quote_currency == "PKR":
        return Decimal("1")

    # Manual rates take precedence
    for source in (FxRateSource.manual, FxRateSource.auto):
        result = await db.execute(
            select(FxRate)
            .where(
                FxRate.base_currency == "PKR",
                FxRate.quote_currency == quote_currency.upper(),
                FxRate.source == source,
            )
            .order_by(FxRate.fetched_at.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row:
            return row.rate

    return Decimal("1")


def convert_from_pkr(amount_pkr: int, rate: Decimal) -> int:
    """Convert a PKR paisa amount to the target currency's minor unit."""
    if rate == Decimal("1"):
        return amount_pkr
    return int(Decimal(amount_pkr) * rate)

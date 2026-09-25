"""FX conversion service: look up PKR→currency rates and convert PKR amounts."""

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import FxRate, FxRateSource

# Display/charge currencies from the project spec. All use 2-decimal minor units,
# so a PKR paisa amount times the PKR→X rate is already in X's minor unit.
SUPPORTED_CURRENCIES: tuple[str, ...] = ("PKR", "USD", "GBP", "EUR", "CAD", "AUD", "AED", "SAR")


async def get_rate(db: AsyncSession, quote_currency: str) -> Decimal | None:
    """Return the PKR→quote_currency rate, or None when no rate is known.

    A manual override wins over the automatic daily rate. Callers must not
    assume a missing rate is 1: that would charge rupee amounts in pounds.
    """
    code = quote_currency.upper()
    if code == "PKR":
        return Decimal("1")

    for source in (FxRateSource.manual, FxRateSource.auto):
        result = await db.execute(
            select(FxRate.rate)
            .where(
                FxRate.base_currency == "PKR",
                FxRate.quote_currency == code,
                FxRate.source == source,
            )
            .order_by(FxRate.fetched_at.desc())
            .limit(1)
        )
        rate = result.scalar_one_or_none()
        if rate is not None and rate > 0:
            return Decimal(rate)
    return None


async def available_rates(db: AsyncSession) -> dict[str, Decimal]:
    """Rates for every supported currency that can currently be charged."""
    rates: dict[str, Decimal] = {}
    for code in SUPPORTED_CURRENCIES:
        rate = await get_rate(db, code)
        if rate is not None:
            rates[code] = rate
    return rates


async def resolve_charge_currency(db: AsyncSession, preferred: str | None) -> tuple[str, Decimal]:
    """Currency and rate to charge in: the buyer's preference if we have a rate, else PKR."""
    code = (preferred or "PKR").upper()
    rate = await get_rate(db, code) if code in SUPPORTED_CURRENCIES else None
    if rate is None:
        return "PKR", Decimal("1")
    return code, rate


def convert_from_pkr(amount_pkr: int, rate: Decimal) -> int:
    """Convert a PKR paisa amount to the target currency's minor unit (half-up)."""
    if rate == Decimal("1"):
        return amount_pkr
    return int((Decimal(amount_pkr) * rate).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

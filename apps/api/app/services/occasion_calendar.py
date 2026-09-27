"""Dates of cultural gifting occasions for buyers abroad.

Eid follows the lunar calendar and is confirmed by moon sighting, so these are
the expected (astronomical) dates; reminders go out a week early, which absorbs
a day's difference. Extend the table yearly (docs/questions.md Q25).
Mother's Day depends on where the buyer lives.
"""

from datetime import date, timedelta

EID_UL_FITR = {2026: date(2026, 3, 20), 2027: date(2027, 3, 9), 2028: date(2028, 2, 26)}
EID_UL_AZHA = {2026: date(2026, 5, 27), 2027: date(2027, 5, 16), 2028: date(2028, 5, 5)}

# Countries that keep Mother's Day on 21 March.
_MARCH_21 = {"AE", "SA", "QA", "KW", "BH", "OM", "EG", "JO", "LB"}
# Second Sunday of May (US tradition), incl. Pakistan itself.
_SECOND_SUNDAY_MAY = {"US", "CA", "AU", "NZ", "PK", "DE", "IT", "NL", "BE", "DK", "FI", "TR", "MY", "SG", "JP", "ZA"}


def easter(year: int) -> date:
    """Western (Gregorian) Easter Sunday: the anonymous Gregorian algorithm."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    ell = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ell) // 451
    month = (h + ell - 7 * m + 114) // 31
    day = (h + ell - 7 * m + 114) % 31 + 1
    return date(year, month, day)


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    first = date(year, month, 1)
    return first + timedelta(days=(weekday - first.weekday()) % 7 + 7 * (n - 1))


def mothers_day(country: str | None, year: int) -> date | None:
    """Mother's Day in the buyer's country, or None when we don't know it."""
    if not country:
        return None
    if country in ("GB", "IE"):
        return easter(year) - timedelta(weeks=3)  # Mothering Sunday
    if country in _MARCH_21:
        return date(year, 3, 21)
    if country in _SECOND_SUNDAY_MAY:
        return _nth_weekday(year, 5, 6, 2)  # weekday 6 = Sunday
    return None


def cultural_occasions(country: str | None, year: int) -> list[tuple[str, str, date]]:
    """(key, name, date) for the year's cultural occasions that apply to this buyer."""
    found: list[tuple[str, str, date]] = []
    if year in EID_UL_FITR:
        found.append(("eid-ul-fitr", "Eid ul-Fitr", EID_UL_FITR[year]))
    if year in EID_UL_AZHA:
        found.append(("eid-ul-azha", "Eid ul-Adha", EID_UL_AZHA[year]))
    md = mothers_day(country, year)
    if md:
        found.append(("mothers-day", "Mother's Day", md))
    return found

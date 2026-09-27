"""Occasion reminders (diaspora Release C).

Once a day, remind buyers of family birthdays and anniversaries from their
address book (7 and 2 days ahead, time to order and deliver) and of Eid and
Mother's Day (7 days ahead). Each reminder is logged under a unique key so it
goes out once, however often the job runs.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.address import Address
from app.models.user import User
from app.repositories.reminder_repository import ReminderRepository
from app.services.occasion_calendar import cultural_occasions
from app.workers.notification_tasks import enqueue_occasion_reminder

logger = structlog.get_logger()

PERSONAL_LEAD_DAYS = (7, 2)
CULTURAL_LEAD_DAYS = (7,)


@dataclass(frozen=True)
class Reminder:
    key: str
    occasion_slug: str
    headline: str
    body: str
    when: date
    days: int
    address_id: uuid.UUID | None = None


def _this_or_next(month: int, day: int, today: date) -> date:
    def on(year: int) -> date:
        try:
            return date(year, month, day)
        except ValueError:  # 29 Feb outside a leap year
            return date(year, 2, 28)

    return on(today.year) if on(today.year) >= today else on(today.year + 1)


def _in_days(days: int) -> str:
    return "tomorrow" if days == 1 else f"in {days} days"


def due_reminders(user: User, addresses: list[Address], today: date) -> list[Reminder]:
    """Reminders due today for this buyer (pure: no I/O, easy to test)."""
    due: list[Reminder] = []
    for a in addresses:
        who = a.relationship_label or a.recipient_name
        for kind, slug, month, day in (
            ("birthday", "birthday", a.birthday_month, a.birthday_day),
            ("anniversary", "anniversary", a.anniversary_month, a.anniversary_day),
        ):
            if not month or not day:
                continue
            when = _this_or_next(month, day, today)
            days = (when - today).days
            if days not in PERSONAL_LEAD_DAYS:
                continue
            due.append(Reminder(
                key=f"{kind}:{a.id}:{when.isoformat()}:{days}",
                occasion_slug=slug,
                headline=f"{who}'s {kind} is {_in_days(days)} ({when.day} {when:%b})",
                body=f"Send something to {a.recipient_name} in {a.city_name} so it arrives on the day.",
                when=when,
                days=days,
                address_id=a.id,
            ))
    for year in (today.year, today.year + 1):
        for slug, name, when in cultural_occasions(user.country, year):
            days = (when - today).days
            if days not in CULTURAL_LEAD_DAYS:
                continue
            due.append(Reminder(
                key=f"{slug}:{user.country or '-'}:{when.isoformat()}:{days}",
                occasion_slug=slug,
                headline=f"{name} is {_in_days(days)} ({when.day} {when:%b})",
                body="Send a gift home to your family in Pakistan, delivered in time for the day.",
                when=when,
                days=days,
            ))
    return due


async def send_due_reminders(db: AsyncSession, today: date) -> int:
    """Queue today's reminders for every opted-in buyer. Returns how many were queued."""
    repo = ReminderRepository(db)
    queued = 0
    for user in await repo.users_to_remind():
        addresses = [a for a in user.addresses if a.is_active]
        for r in due_reminders(user, addresses, today):
            if not await repo.mark_sent(user.id, r.key):
                continue  # already sent on an earlier run
            queued += await enqueue_occasion_reminder(
                db=db,
                user_id=user.id,
                email=user.email,
                phone=user.phone,
                headline=r.headline,
                body=r.body,
                occasion_slug=r.occasion_slug,
                address_id=r.address_id,
            )
    await db.commit()
    await logger.ainfo("occasion_reminders_queued", count=queued, day=today.isoformat())
    return queued


def today_utc() -> date:
    return datetime.now(UTC).date()

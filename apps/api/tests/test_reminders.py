"""Occasion reminders: family birthdays/anniversaries, Eid and Mother's Day."""

import uuid
from datetime import date

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.address import Address
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.occasion_calendar import easter, mothers_day
from app.services.reminder_service import due_reminders, send_due_reminders
from app.workers.outbox_worker import reminder_link


def _address(**overrides: object) -> Address:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "recipient_name": "Shabana Khan",
        "recipient_phone": "+923001234567",
        "line1": "House 5",
        "city_name": "Lahore",
        "relationship_label": "Ammi",
        "birthday_month": 10,
        "birthday_day": 5,
        "is_active": True,
    }
    fields.update(overrides)
    return Address(**fields)


# ── Calendar ─────────────────────────────────────────────────────────────────


def test_mothers_day_depends_on_where_the_buyer_lives() -> None:
    assert easter(2026) == date(2026, 4, 5)
    assert mothers_day("GB", 2026) == date(2026, 3, 15)  # Mothering Sunday, 3 weeks before Easter
    assert mothers_day("US", 2026) == date(2026, 5, 10)  # second Sunday of May
    assert mothers_day("AE", 2026) == date(2026, 3, 21)
    assert mothers_day(None, 2026) is None
    assert mothers_day("XX", 2026) is None


# ── Which reminders are due ──────────────────────────────────────────────────


def test_birthday_reminders_go_out_7_and_2_days_ahead() -> None:
    user = User(country=None)
    ammi = _address()

    week = due_reminders(user, [ammi], date(2026, 9, 28))
    two = due_reminders(user, [ammi], date(2026, 10, 3))
    other = due_reminders(user, [ammi], date(2026, 9, 30))

    assert [r.headline for r in week] == ["Ammi's birthday is in 7 days (5 Oct)"]
    assert week[0].body == "Send something to Shabana Khan in Lahore so it arrives on the day."
    assert week[0].address_id == ammi.id
    assert [r.headline for r in two] == ["Ammi's birthday is in 2 days (5 Oct)"]
    assert other == []


def test_anniversary_uses_the_name_when_no_relationship_is_set() -> None:
    a = _address(relationship_label=None, birthday_month=None, birthday_day=None, anniversary_month=1, anniversary_day=3)
    [r] = due_reminders(User(country=None), [a], date(2026, 12, 27))
    assert r.headline == "Shabana Khan's anniversary is in 7 days (3 Jan)"
    assert r.occasion_slug == "anniversary"


def test_leap_day_birthday_is_remembered_on_28_feb() -> None:
    a = _address(birthday_month=2, birthday_day=29)
    [r] = due_reminders(User(country=None), [a], date(2027, 2, 21))
    assert r.when == date(2027, 2, 28)


def test_eid_and_country_mothers_day_are_due_a_week_ahead() -> None:
    uk = User(country="GB")
    eid = due_reminders(uk, [], date(2027, 3, 2))
    mothers = due_reminders(uk, [], date(2027, 2, 28))

    assert [r.occasion_slug for r in eid] == ["eid-ul-fitr"]
    assert eid[0].headline == "Eid ul-Fitr is in 7 days (9 Mar)"
    assert [r.headline for r in mothers] == ["Mother's Day is in 7 days (7 Mar)"]
    # A US buyer's Mother's Day is in May, so nothing on the UK date.
    assert due_reminders(User(country="US"), [], date(2027, 2, 28)) == []


def test_reminder_links_open_that_person_or_the_occasion() -> None:
    url = "https://tahaif.com"
    assert reminder_link({"occasion_slug": "birthday", "address_id": "a-1"}, url) == (
        "https://tahaif.com/send/a-1?occasion=birthday"
    )
    assert reminder_link({"occasion_slug": "eid-ul-fitr", "address_id": None}, url) == (
        "https://tahaif.com/occasion/eid-ul-fitr"
    )


# ── The daily job ────────────────────────────────────────────────────────────


async def _buyer(db: AsyncSession, **fields: object) -> User:
    user = await UserRepository(db).create(
        email=f"remind_{uuid.uuid4().hex[:8]}@example.com", password_hash=hash_password("Password1")
    )
    for k, v in fields.items():
        setattr(user, k, v)
    return user


async def _queued(db: AsyncSession, user: User) -> list[tuple[str, str]]:
    result = await db.execute(
        sa.text(
            "SELECT channel::text, payload->>'headline' FROM notifications_outbox "
            "WHERE template = 'occasion_reminder' AND payload->>'user_id' = :u ORDER BY channel"
        ),
        {"u": str(user.id)},
    )
    return [tuple(r) for r in result.all()]  # type: ignore[misc]


@pytest.mark.asyncio
async def test_job_sends_each_reminder_once(outbox: AsyncSession) -> None:
    user = await _buyer(outbox, phone=f"+4477{uuid.uuid4().int % 10**8:08d}")
    outbox.add(_address(user_id=user.id))
    await outbox.flush()

    first = await send_due_reminders(outbox, date(2026, 9, 28))
    again = await send_due_reminders(outbox, date(2026, 9, 28))

    assert first >= 2
    assert again == 0
    assert await _queued(outbox, user) == [
        ("email", "Ammi's birthday is in 7 days (5 Oct)"),
        ("whatsapp", "Ammi's birthday is in 7 days (5 Oct)"),
    ]


@pytest.mark.asyncio
async def test_job_respects_opt_out_and_deleted_addresses(outbox: AsyncSession) -> None:
    opted_out = await _buyer(outbox, occasion_reminders=False)
    outbox.add(_address(user_id=opted_out.id))
    removed = await _buyer(outbox)
    outbox.add(_address(user_id=removed.id, is_active=False))
    await outbox.flush()

    await send_due_reminders(outbox, date(2026, 9, 28))

    assert await _queued(outbox, opted_out) == []
    assert await _queued(outbox, removed) == []


@pytest.mark.asyncio
async def test_buyer_sets_country_and_can_turn_reminders_off(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": f"country_{uuid.uuid4().hex[:8]}@example.com", "password": "Strongpass1", "full_name": "Ali"},
    )
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await client.get("/api/v1/me", headers=headers)).json()["occasion_reminders"] is True

    updated = await client.patch("/api/v1/me", json={"country": "GB", "occasion_reminders": False}, headers=headers)

    assert updated.status_code == 200
    assert updated.json()["country"] == "GB"
    assert updated.json()["occasion_reminders"] is False
    assert (await client.patch("/api/v1/me", json={"country": "gb"}, headers=headers)).status_code == 422

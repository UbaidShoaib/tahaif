import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.reminder import OccasionReminderSent
from app.models.user import User


class ReminderRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def users_to_remind(self) -> list[User]:
        """Active buyers who haven't opted out, with their address book loaded."""
        result = await self._db.execute(
            select(User)
            .options(selectinload(User.addresses))
            .where(User.is_active.is_(True), User.occasion_reminders.is_(True))
        )
        return list(result.scalars().all())

    async def mark_sent(self, user_id: uuid.UUID, key: str) -> bool:
        """Record a reminder; False if it was already recorded (so don't send it again)."""
        result = await self._db.execute(
            insert(OccasionReminderSent)
            .values(id=uuid.uuid4(), user_id=user_id, reminder_key=key)
            .on_conflict_do_nothing(constraint="uq_occasion_reminder_once")
            .returning(OccasionReminderSent.id)
        )
        return result.scalar_one_or_none() is not None

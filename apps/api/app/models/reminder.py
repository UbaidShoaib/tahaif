import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin


class OccasionReminderSent(UUIDPrimaryKeyMixin, Base):
    """One row per reminder sent, so the daily job never sends the same one twice."""

    __tablename__ = "occasion_reminders_sent"
    __table_args__ = (UniqueConstraint("user_id", "reminder_key", name="uq_occasion_reminder_once"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reminder_key: Mapped[str] = mapped_column(String(200), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

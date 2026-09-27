import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class Address(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "addresses"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recipient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient_phone: Mapped[str] = mapped_column(String(30), nullable=False)
    line1: Mapped[str] = mapped_column(Text, nullable=False)
    line2: Mapped[str | None] = mapped_column(Text, nullable=True)
    city_name: Mapped[str] = mapped_column(String(100), nullable=False)
    landmark: Mapped[str | None] = mapped_column(Text, nullable=True)
    alt_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Family address book: who they are to the buyer, and month/day occasions
    # (no year) for reminders.
    relationship_label: Mapped[str | None] = mapped_column("relationship", String(40), nullable=True)
    birthday_month: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    birthday_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    anniversary_month: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    anniversary_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship(back_populates="addresses")

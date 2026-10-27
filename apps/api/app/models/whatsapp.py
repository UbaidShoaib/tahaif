"""WhatsApp ordering bot state (ADR 0013)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class WhatsAppConversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Where one customer is in the ordering chat, and what they've chosen so far.

    One row per WhatsApp number. ``data`` holds the answers (city, product, date,
    recipient...) until the order is placed; it's cleared when they start over.
    """

    __tablename__ = "whatsapp_conversations"

    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    profile_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    step: Mapped[str] = mapped_column(String(30), default="start", nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    last_order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )


class WhatsAppInboundMessage(UUIDPrimaryKeyMixin, Base):
    """Message ids already handled. Meta retries webhooks, so the same message
    can arrive twice; the unique id makes the second one a no-op."""

    __tablename__ = "whatsapp_inbound_messages"

    wa_message_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

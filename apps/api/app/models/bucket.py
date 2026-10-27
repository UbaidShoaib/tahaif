"""Custom buckets: a buyer-built hamper or bouquet (ADR 0014)."""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.catalog import Product


class BuilderKind(enum.StrEnum):
    HAMPER = "hamper"
    BOUQUET = "bouquet"


class ComponentRole(enum.StrEnum):
    ITEM = "item"
    STEM = "stem"
    WRAP = "wrap"
    RIBBON = "ribbon"
    FILLER = "filler"


class BucketStatus(enum.StrEnum):
    DRAFT = "draft"
    IN_CART = "in_cart"
    ORDERED = "ordered"


class BuilderComponent(UUIDPrimaryKeyMixin, Base):
    """A product that may be dropped into a builder base, and how many of it."""

    __tablename__ = "builder_components"
    __table_args__ = (UniqueConstraint("builder_product_id", "component_product_id"),)

    builder_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    component_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), default=ComponentRole.ITEM, nullable=False)
    max_qty: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    component: Mapped["Product"] = relationship(foreign_keys=[component_product_id])


class CustomBucket(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One bucket being built. Anyone holding the share token can edit it live.

    ``state`` is the list of placed pieces:
    ``[{"key", "component_id", "variant_id", "qty", "x", "y", "rotation", "z"}]``.
    ``version`` goes up by one on every accepted edit, so stale edits are refused.
    """

    __tablename__ = "custom_buckets"

    builder_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # sha256 of the share token; the token itself is only ever in the link.
    share_token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    state: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=BucketStatus.DRAFT, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    builder_product: Mapped["Product"] = relationship()

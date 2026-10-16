"""card note safety: buyer consent record and recipient reports

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-17

The buyer agrees to the content rules before attaching a voice/video note
(note_consent_at / note_consent_ip). Anyone who opens a note from the card's
QR code can report it; card_note_reports keeps one report per (item, IP).
Staff review reports in the admin and can take a note down (note_disabled_*).
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_items", sa.Column("note_consent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("order_items", sa.Column("note_consent_ip", sa.String(45), nullable=True))
    op.add_column("order_items", sa.Column("note_disabled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "order_items",
        sa.Column(
            "note_disabled_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_table(
        "card_note_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "order_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("order_items.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("details", sa.Text, nullable=True),
        sa.Column("reporter_ip", sa.String(45), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), server_default="open", nullable=False, index=True),
        sa.Column(
            "resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("order_item_id", "reporter_ip", name="uq_card_note_reports_item_ip"),
    )


def downgrade() -> None:
    op.drop_table("card_note_reports")
    op.drop_column("order_items", "note_disabled_by")
    op.drop_column("order_items", "note_disabled_at")
    op.drop_column("order_items", "note_consent_ip")
    op.drop_column("order_items", "note_consent_at")

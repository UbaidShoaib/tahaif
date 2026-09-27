"""greeting card voice/video notes on order items

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-28

A buyer abroad can attach a short voice or video note to a gift's card. The
file lives in the private bucket (note_key); the printed card carries a QR
code to /note/{note_token}. note_token is its own random value so the QR
opens only the note, never the order's tracking page.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_items", sa.Column("note_key", sa.Text(), nullable=True))
    op.add_column("order_items", sa.Column("note_content_type", sa.String(100), nullable=True))
    op.add_column("order_items", sa.Column("note_token", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_order_items_note_token", "order_items", ["note_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_order_items_note_token", table_name="order_items")
    op.drop_column("order_items", "note_token")
    op.drop_column("order_items", "note_content_type")
    op.drop_column("order_items", "note_key")

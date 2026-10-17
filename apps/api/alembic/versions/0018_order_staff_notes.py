"""order staff notes: internal notes on an order for the back office

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-17

Staff write notes on an order ("buyer called, deliver after 5pm"). They are
never shown to the buyer or recipient and are append-only.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "order_staff_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_order_staff_notes_order_id", "order_staff_notes", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_order_staff_notes_order_id", table_name="order_staff_notes")
    op.drop_table("order_staff_notes")

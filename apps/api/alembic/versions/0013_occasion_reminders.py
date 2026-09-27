"""occasion reminders: buyer country, opt-out, and a sent log

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-28

A daily job reminds buyers of family birthdays/anniversaries (address book)
and of Eid and Mother's Day, the latter on the buyer's own country's date
(users.country). users.occasion_reminders is the opt-out. Each reminder is
recorded in occasion_reminders_sent under a unique key so it is sent once.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("country", sa.String(2), nullable=True))
    op.add_column(
        "users", sa.Column("occasion_reminders", sa.Boolean(), nullable=False, server_default=sa.true())
    )
    op.create_table(
        "occasion_reminders_sent",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reminder_key", sa.String(200), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("user_id", "reminder_key", name="uq_occasion_reminder_once"),
    )


def downgrade() -> None:
    op.drop_table("occasion_reminders_sent")
    op.drop_column("users", "occasion_reminders")
    op.drop_column("users", "country")

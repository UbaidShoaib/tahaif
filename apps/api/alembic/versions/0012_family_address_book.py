"""family address book: relationship and occasions on saved addresses

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-28

Saved recipients become family: who they are to the buyer ("Ammi") and the
dates worth remembering. Birthdays and anniversaries are month/day only;
many families don't know or share the year. Occasion reminders build on these.
"""

import sqlalchemy as sa

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

_COLUMNS = ("birthday_month", "birthday_day", "anniversary_month", "anniversary_day")


def upgrade() -> None:
    op.add_column("addresses", sa.Column("relationship", sa.String(40), nullable=True))
    for name in _COLUMNS:
        op.add_column("addresses", sa.Column(name, sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    for name in reversed(_COLUMNS):
        op.drop_column("addresses", name)
    op.drop_column("addresses", "relationship")

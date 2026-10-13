"""vendor applications: approval status, contact phone, review note

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-14

Anyone signed in can apply to open a shop; it stays hidden (is_active false,
approval_status 'pending') until staff approve it. Existing shops were created
by staff, so they are backfilled as 'approved'.
"""

import sqlalchemy as sa

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vendors",
        sa.Column("approval_status", sa.String(20), nullable=False, server_default="approved"),
    )
    op.add_column("vendors", sa.Column("contact_phone", sa.String(30), nullable=True))
    op.add_column("vendors", sa.Column("review_note", sa.Text(), nullable=True))
    op.add_column("vendors", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_vendors_approval_status", "vendors", ["approval_status"])


def downgrade() -> None:
    op.drop_index("ix_vendors_approval_status", table_name="vendors")
    op.drop_column("vendors", "reviewed_at")
    op.drop_column("vendors", "review_note")
    op.drop_column("vendors", "contact_phone")
    op.drop_column("vendors", "approval_status")

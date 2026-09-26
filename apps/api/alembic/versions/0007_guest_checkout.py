"""guest checkout: buyer contact on orders

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-26

Guest orders have no user, so the buyer's email and phone for the
confirmation are stored on the order (ADR 0004). Nullable: signed-in
orders keep using the user's details.
"""

import sqlalchemy as sa

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("contact_email", sa.String(255), nullable=True))
    op.add_column("orders", sa.Column("contact_phone", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "contact_phone")
    op.drop_column("orders", "contact_email")

"""coupons: per_customer_limit caps how often one buyer can use a code

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-24

NULL means no per-buyer cap (the old behaviour), so existing coupons are unchanged.
A first-order code like WELCOME is created with per_customer_limit = 1.
"""

import sqlalchemy as sa

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("coupons", sa.Column("per_customer_limit", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("coupons", "per_customer_limit")

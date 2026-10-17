"""untracked variant stock: stock_qty NULL means made to order, not counted

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-18

Cakes and bouquets are made to order; only boxed goods (perfume, hampers) have
a real count. Existing rows keep their numbers.
"""

import sqlalchemy as sa

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("product_variants", "stock_qty", existing_type=sa.Integer(), nullable=True, server_default=None)


def downgrade() -> None:
    op.execute("UPDATE product_variants SET stock_qty = 0 WHERE stock_qty IS NULL")
    op.alter_column("product_variants", "stock_qty", existing_type=sa.Integer(), nullable=False)

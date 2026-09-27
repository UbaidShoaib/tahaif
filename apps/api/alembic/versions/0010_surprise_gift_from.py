"""surprise mode and sender name on orders

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-28

Recipients now get WhatsApp messages about their gift. `gift_from` is the
sender name those messages use ("A gift from Ali"); `surprise` means no
message before delivery and a reveal afterwards, and tells the rider not to
call ahead.
"""

import sqlalchemy as sa

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("surprise", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("orders", sa.Column("gift_from", sa.String(80), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "gift_from")
    op.drop_column("orders", "surprise")

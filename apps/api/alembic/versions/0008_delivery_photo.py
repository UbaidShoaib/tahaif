"""proof of delivery: photo and received-by on fulfillments

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-27

Overseas buyers can't see the doorstep, so the vendor attaches a delivery
photo and the name of whoever received the gift. The photo's object key is
stored (the bucket is private); tracking serves a short-lived signed link.
"""

import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("fulfillments", sa.Column("delivery_photo_key", sa.Text(), nullable=True))
    op.add_column("fulfillments", sa.Column("received_by", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("fulfillments", "received_by")
    op.drop_column("fulfillments", "delivery_photo_key")

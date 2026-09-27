"""recipient thank-you replies on fulfillments

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-28

The recipient can send the buyer a thank-you (text and/or one photo, voice
note or video) from /thanks/{thanks_token}, linked by a QR on the card and in
the recipient's WhatsApp message. One reply per fulfillment; sending again
replaces it. Media lives in the private bucket.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("fulfillments", sa.Column("thanks_token", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("UPDATE fulfillments SET thanks_token = gen_random_uuid() WHERE thanks_token IS NULL")
    op.alter_column("fulfillments", "thanks_token", nullable=False)
    op.create_index("ix_fulfillments_thanks_token", "fulfillments", ["thanks_token"], unique=True)
    op.add_column("fulfillments", sa.Column("thanks_message", sa.Text(), nullable=True))
    op.add_column("fulfillments", sa.Column("thanks_media_key", sa.Text(), nullable=True))
    op.add_column("fulfillments", sa.Column("thanks_media_type", sa.String(100), nullable=True))
    op.add_column("fulfillments", sa.Column("thanks_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("fulfillments", "thanks_at")
    op.drop_column("fulfillments", "thanks_media_type")
    op.drop_column("fulfillments", "thanks_media_key")
    op.drop_column("fulfillments", "thanks_message")
    op.drop_index("ix_fulfillments_thanks_token", table_name="fulfillments")
    op.drop_column("fulfillments", "thanks_token")

"""whatsapp bot: ordering conversations and handled inbound message ids

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-19

Customers can order inside WhatsApp (ADR 0013). whatsapp_conversations keeps
each number's step in the chat and the answers so far; whatsapp_inbound_messages
records message ids already handled, because Meta retries webhook deliveries.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phone", sa.String(20), nullable=False, unique=True),
        sa.Column("profile_name", sa.String(255), nullable=True),
        sa.Column("step", sa.String(30), nullable=False, server_default="start"),
        sa.Column("data", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "last_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "whatsapp_inbound_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("wa_message_id", sa.String(255), nullable=False, unique=True),
        sa.Column("phone", sa.String(20), nullable=False, index=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("whatsapp_inbound_messages")
    op.drop_table("whatsapp_conversations")

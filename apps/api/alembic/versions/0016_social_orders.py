"""social orders: order source/attribution, customer confirmation, manual WhatsApp log

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-17

Orders taken by staff from Instagram DMs and WhatsApp chats (ADR 0009) record
where they came from, who entered them and which reel/campaign sold them. The
buyer confirms the details on the order link page (customer_confirmed_at).
order_messages logs the wa.me messages staff sent by hand, one per kind.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("source", sa.String(20), server_default="web", nullable=False))
    op.create_index("ix_orders_source", "orders", ["source"])
    op.add_column("orders", sa.Column("source_ref", sa.String(255), nullable=True))
    op.add_column("orders", sa.Column("campaign", sa.String(100), nullable=True))
    op.add_column(
        "orders",
        sa.Column(
            "created_by_staff_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("orders", sa.Column("customer_confirmed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orders", sa.Column("marketing_opt_in_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "order_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column(
            "sent_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("order_id", "kind", name="uq_order_messages_order_kind"),
    )


def downgrade() -> None:
    op.drop_table("order_messages")
    op.drop_column("orders", "marketing_opt_in_at")
    op.drop_column("orders", "customer_confirmed_at")
    op.drop_column("orders", "created_by_staff_id")
    op.drop_column("orders", "campaign")
    op.drop_column("orders", "source_ref")
    op.drop_index("ix_orders_source", table_name="orders")
    op.drop_column("orders", "source")

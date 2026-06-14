"""idempotency_key on orders, newsletter_subscribers

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-14
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── orders.idempotency_key ────────────────────────────────────────────────
    op.add_column(
        "orders",
        sa.Column("idempotency_key", sa.String(64), nullable=True),
    )
    op.create_unique_constraint("uq_orders_idempotency_key", "orders", ["idempotency_key"])
    op.create_index("ix_orders_idempotency_key", "orders", ["idempotency_key"])

    # ── newsletter_subscribers ────────────────────────────────────────────────
    op.create_table(
        "newsletter_subscribers",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("confirmed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("subscribed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_newsletter_subscribers_email", "newsletter_subscribers", ["email"], unique=True)
    op.create_index("ix_newsletter_subscribers_token", "newsletter_subscribers", ["token"])


def downgrade() -> None:
    op.drop_table("newsletter_subscribers")
    op.drop_index("ix_orders_idempotency_key", table_name="orders")
    op.drop_constraint("uq_orders_idempotency_key", "orders", type_="unique")
    op.drop_column("orders", "idempotency_key")

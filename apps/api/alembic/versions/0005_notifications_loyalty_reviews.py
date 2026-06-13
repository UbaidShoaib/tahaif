"""notifications_outbox, loyalty, reviews, coupons, banners, audit_logs

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-13
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── notifications_outbox ──────────────────────────────────────────────────
    op.create_table(
        "notifications_outbox",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("channel", sa.Enum("email", "sms", "whatsapp", name="notification_channel"), nullable=False),
        sa.Column("to_address", sa.String(255), nullable=False),
        sa.Column("template", sa.String(100), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.Enum("pending", "sent", "failed", name="notification_status"),
                  nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_outbox_status", "notifications_outbox", ["status"])

    # ── loyalty_wallets ───────────────────────────────────────────────────────
    op.create_table(
        "loyalty_wallets",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("balance_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lifetime_earned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lifetime_burned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )

    # ── loyalty_ledger ────────────────────────────────────────────────────────
    op.create_table(
        "loyalty_ledger",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=True),
        sa.Column("delta_points", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_loyalty_ledger_user_id", "loyalty_ledger", ["user_id"])

    # ── reviews ───────────────────────────────────────────────────────────────
    op.create_table(
        "reviews",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("order_item_id", sa.UUID(), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("images", postgresql.JSONB(), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="SET NULL"),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reviews_product_id", "reviews", ["product_id"])
    op.create_index("ix_reviews_user_id", "reviews", ["user_id"])

    # ── coupons ───────────────────────────────────────────────────────────────
    op.create_table(
        "coupons",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("coupon_type", sa.Enum("percent", "fixed", "free_shipping", name="coupon_type"), nullable=False),
        sa.Column("value", sa.Numeric(10, 2), nullable=False),
        sa.Column("min_order_pkr", sa.BigInteger(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("usage_limit", sa.Integer(), nullable=True),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_coupons_code", "coupons", ["code"], unique=True)

    # ── banners ───────────────────────────────────────────────────────────────
    op.create_table(
        "banners",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("slot", sa.String(50), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("link_url", sa.Text(), nullable=True),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("subtitle", sa.String(255), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_banners_slot", "banners", ["slot"])

    # ── testimonials ──────────────────────────────────────────────────────────
    op.create_table(
        "testimonials",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_testimonials_rating"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── audit_logs ────────────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.String(255), nullable=True),
        sa.Column("before", postgresql.JSONB(), nullable=True),
        sa.Column("after", postgresql.JSONB(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity", "entity_id"])
    op.create_index("ix_audit_logs_actor", "audit_logs", ["actor_user_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("testimonials")
    op.drop_table("banners")
    op.drop_table("coupons")
    op.execute("DROP TYPE IF EXISTS coupon_type")
    op.drop_table("reviews")
    op.drop_table("loyalty_ledger")
    op.drop_table("loyalty_wallets")
    op.drop_table("notifications_outbox")
    op.execute("DROP TYPE IF EXISTS notification_status")
    op.execute("DROP TYPE IF EXISTS notification_channel")

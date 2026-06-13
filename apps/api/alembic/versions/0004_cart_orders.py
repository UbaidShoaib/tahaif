"""cart, orders, fulfillments, payments

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-13
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0004"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── carts ─────────────────────────────────────────────────────────────────
    op.create_table(
        "carts",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("session_token", sa.String(64), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="PKR"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_carts_user_id", "carts", ["user_id"])
    op.create_index("ix_carts_session_token", "carts", ["session_token"], unique=True,
                    postgresql_where=sa.text("session_token IS NOT NULL"))

    # ── cart_items ────────────────────────────────────────────────────────────
    op.create_table(
        "cart_items",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("cart_id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("variant_id", sa.UUID(), nullable=True),
        sa.Column("qty", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("recipient_name", sa.String(255), nullable=True),
        sa.Column("recipient_phone", sa.String(30), nullable=True),
        sa.Column("recipient_address_id", sa.UUID(), nullable=True),
        sa.Column("delivery_date", sa.Date(), nullable=True),
        sa.Column("delivery_slot", sa.String(50), nullable=True),
        sa.Column("customization", postgresql.JSONB(), nullable=True),
        sa.Column("greeting_message", sa.Text(), nullable=True),
        sa.Column("gift_image_url", sa.Text(), nullable=True),
        sa.Column("line_total_pkr", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["cart_id"], ["carts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["recipient_address_id"], ["addresses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cart_items_cart_id", "cart_items", ["cart_id"])

    # ── orders ────────────────────────────────────────────────────────────────
    op.create_table(
        "orders",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("public_token", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        # FX rate snapshot at order time (PKR per 1 unit of currency)
        sa.Column("fx_rate_to_pkr", sa.Numeric(18, 6), nullable=False, server_default="1"),
        sa.Column("subtotal_pkr", sa.BigInteger(), nullable=False),
        sa.Column("discount_pkr", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("delivery_pkr", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("total_pkr", sa.BigInteger(), nullable=False),
        # Amount charged in buyer's currency (minor units)
        sa.Column("total_charged", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.Enum("pending_payment", "paid", "preparing", "dispatched",
                                    "out_for_delivery", "delivered", "completed",
                                    "cancelled", "refunded", "on_hold", name="order_status"),
                  nullable=False, server_default="pending_payment"),
        sa.Column("coupon_code", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("placed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orders_public_token", "orders", ["public_token"], unique=True)
    op.create_index("ix_orders_user_id", "orders", ["user_id"])
    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_index("ix_orders_placed_at", "orders", ["placed_at"])

    # ── fulfillments ──────────────────────────────────────────────────────────
    op.create_table(
        "fulfillments",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("vendor_id", sa.UUID(), nullable=False),
        sa.Column("recipient_name", sa.String(255), nullable=False),
        sa.Column("recipient_phone", sa.String(30), nullable=False),
        sa.Column("address_line1", sa.Text(), nullable=False),
        sa.Column("address_line2", sa.Text(), nullable=True),
        sa.Column("city_id", sa.UUID(), nullable=False),
        sa.Column("landmark", sa.Text(), nullable=True),
        sa.Column("delivery_date", sa.Date(), nullable=False),
        sa.Column("delivery_slot", sa.String(50), nullable=True),
        sa.Column("status", sa.Enum("pending", "preparing", "ready", "dispatched",
                                    "out_for_delivery", "delivered", "failed",
                                    name="fulfillment_status"),
                  nullable=False, server_default="pending"),
        sa.Column("courier_tracking", sa.String(255), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["city_id"], ["cities.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fulfillments_order_id", "fulfillments", ["order_id"])
    op.create_index("ix_fulfillments_vendor_id", "fulfillments", ["vendor_id"])
    op.create_index("ix_fulfillments_status", "fulfillments", ["status"])
    op.create_index("ix_fulfillments_delivery_date", "fulfillments", ["delivery_date"])

    # ── order_items ───────────────────────────────────────────────────────────
    op.create_table(
        "order_items",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("fulfillment_id", sa.UUID(), nullable=True),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("variant_id", sa.UUID(), nullable=True),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("unit_price_pkr", sa.BigInteger(), nullable=False),
        sa.Column("line_total_pkr", sa.BigInteger(), nullable=False),
        sa.Column("customization", postgresql.JSONB(), nullable=True),
        sa.Column("greeting_message", sa.Text(), nullable=True),
        sa.Column("gift_image_url", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fulfillment_id"], ["fulfillments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])
    op.create_index("ix_order_items_fulfillment_id", "order_items", ["fulfillment_id"])

    # ── payments ──────────────────────────────────────────────────────────────
    op.create_table(
        "payments",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("method", sa.Enum("cod", "bank_transfer", "stripe", "jazzcash", "easypaisa", "paypal",
                                    name="payment_method"), nullable=False),
        sa.Column("status", sa.Enum("pending_cod", "pending_proof", "awaiting_verification",
                                    "paid", "failed", "refunded", name="payment_status"),
                  nullable=False),
        sa.Column("amount_pkr", sa.BigInteger(), nullable=False),
        sa.Column("amount_charged", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        # Bank transfer: uploaded proof screenshot URL
        sa.Column("proof_url", sa.Text(), nullable=True),
        # External gateway reference
        sa.Column("provider_ref", sa.String(255), nullable=True),
        sa.Column("verified_by", sa.UUID(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_response", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verified_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payments_order_id", "payments", ["order_id"])


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_table("order_items")
    op.drop_table("fulfillments")
    op.drop_table("orders")
    op.drop_table("cart_items")
    op.drop_table("carts")
    op.execute("DROP TYPE IF EXISTS payment_status")
    op.execute("DROP TYPE IF EXISTS payment_method")
    op.execute("DROP TYPE IF EXISTS fulfillment_status")
    op.execute("DROP TYPE IF EXISTS order_status")

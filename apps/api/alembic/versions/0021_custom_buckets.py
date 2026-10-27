"""custom buckets: buyer-built hampers and bouquets

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-20

A product with builder_kind set is a base (basket, wrap) that buyers fill with
the components listed in builder_components. custom_buckets holds each bucket
being built; several people can edit one live through its share link (ADR 0014).
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("builder_kind", sa.String(20), nullable=True))
    op.add_column("products", sa.Column("builder_min_items", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("builder_max_items", sa.Integer(), nullable=True))
    op.create_table(
        "builder_components",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "builder_product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "component_product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False, server_default="item"),
        sa.Column("max_qty", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("builder_product_id", "component_product_id"),
    )
    op.create_table(
        "custom_buckets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "builder_product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "owner_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("share_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("state", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("custom_buckets")
    op.drop_table("builder_components")
    op.drop_column("products", "builder_max_items")
    op.drop_column("products", "builder_min_items")
    op.drop_column("products", "builder_kind")

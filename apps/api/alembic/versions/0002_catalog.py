"""catalog: cities, vendors, categories, products, images, product_cities,
occasions, product_variants, customization_fields, fx_rates, M2M tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-13
"""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── cities ────────────────────────────────────────────────────────────────
    op.create_table(
        "cities",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cities_slug", "cities", ["slug"], unique=True)

    # ── vendors ───────────────────────────────────────────────────────────────
    op.create_table(
        "vendors",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("city_id", sa.UUID(), nullable=False),
        sa.Column("owner_user_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["city_id"], ["cities.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vendors_city_id", "vendors", ["city_id"])
    op.create_index("ix_vendors_owner_user_id", "vendors", ["owner_user_id"])
    op.create_index("ix_vendors_slug", "vendors", ["slug"], unique=True)

    # ── categories ────────────────────────────────────────────────────────────
    op.create_table(
        "categories",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("parent_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])
    op.create_index("ix_categories_slug", "categories", ["slug"], unique=True)

    # ── occasions ─────────────────────────────────────────────────────────────
    op.create_table(
        "occasions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("name_ur", sa.String(100), nullable=True),
        sa.Column("banner_url", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_occasions_slug", "occasions", ["slug"], unique=True)

    # ── products ──────────────────────────────────────────────────────────────
    op.create_table(
        "products",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("vendor_id", sa.UUID(), nullable=False),
        sa.Column("category_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("base_price_pkr", sa.BigInteger(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_products_vendor_id", "products", ["vendor_id"])
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_slug", "products", ["slug"], unique=True)

    # ── product_images ────────────────────────────────────────────────────────
    op.create_table(
        "product_images",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("alt_text", sa.String(255), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_images_product_id", "product_images", ["product_id"])

    # ── product_cities ────────────────────────────────────────────────────────
    op.create_table(
        "product_cities",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("city_id", sa.UUID(), nullable=False),
        sa.Column("price_override_pkr", sa.BigInteger(), nullable=True),
        sa.Column("delivery_fee_pkr", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("lead_time_hours", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("same_day_cutoff", sa.Time(), nullable=True),
        sa.Column("is_available", sa.Boolean(), nullable=False, server_default="true"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["city_id"], ["cities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "city_id"),
    )
    op.create_index("ix_product_cities_product_id", "product_cities", ["product_id"])
    op.create_index("ix_product_cities_city_id", "product_cities", ["city_id"])

    # ── product_variants ──────────────────────────────────────────────────────
    op.create_table(
        "product_variants",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("price_delta_pkr", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("stock_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attrs", sa.dialects.postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku"),
    )
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"])

    # ── customization_fields ──────────────────────────────────────────────────
    op.create_table(
        "customization_fields",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column(
            "field_type",
            sa.Enum("text", "image", "select", name="customization_field_type"),
            nullable=False,
        ),
        sa.Column("required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("max_len", sa.Integer(), nullable=True),
        sa.Column("options", sa.dialects.postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_customization_fields_product_id", "customization_fields", ["product_id"])

    # ── fx_rates ──────────────────────────────────────────────────────────────
    op.create_table(
        "fx_rates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("base_currency", sa.String(3), nullable=False, server_default="PKR"),
        sa.Column("quote_currency", sa.String(3), nullable=False),
        sa.Column("rate", sa.Numeric(18, 6), nullable=False),
        sa.Column(
            "source",
            sa.Enum("auto", "manual", name="fx_rate_source"),
            nullable=False,
            server_default="auto",
        ),
        sa.Column("set_by", sa.UUID(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["set_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── M2M: product_occasions ────────────────────────────────────────────────
    op.create_table(
        "product_occasions",
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("occasion_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["occasion_id"], ["occasions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("product_id", "occasion_id"),
    )

    # ── M2M: product_categories ───────────────────────────────────────────────
    op.create_table(
        "product_categories",
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("category_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("product_id", "category_id"),
    )


def downgrade() -> None:
    op.drop_table("product_categories")
    op.drop_table("product_occasions")
    op.drop_table("fx_rates")
    op.drop_table("customization_fields")
    op.drop_table("product_variants")
    op.drop_table("product_cities")
    op.drop_table("product_images")
    op.drop_table("products")
    op.drop_table("occasions")
    op.drop_table("categories")
    op.drop_table("vendors")
    op.drop_table("cities")
    op.execute("DROP TYPE IF EXISTS fx_rate_source")
    op.execute("DROP TYPE IF EXISTS customization_field_type")

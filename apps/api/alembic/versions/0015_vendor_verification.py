"""vendor verification: payout bank details and identity/business documents

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-16

An application now carries where the shop is paid (account title, bank, IBAN)
and uploaded documents (CNIC both sides required; business registration and
shop photos optional). Files live in the private bucket under vendor-docs/.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vendors", sa.Column("bank_account_title", sa.String(255), nullable=True))
    op.add_column("vendors", sa.Column("bank_name", sa.String(100), nullable=True))
    op.add_column("vendors", sa.Column("bank_iban", sa.String(34), nullable=True))
    op.create_table(
        "vendor_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "vendor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("vendors.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("object_key", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("vendor_documents")
    op.drop_column("vendors", "bank_iban")
    op.drop_column("vendors", "bank_name")
    op.drop_column("vendors", "bank_account_title")

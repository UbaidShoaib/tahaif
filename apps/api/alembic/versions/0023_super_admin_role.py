"""users: super_admin role, above admin

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-27

Only a super admin can add, demote or deactivate admins; admins manage staff.
The oldest active admin becomes the first super admin, so an existing install
always has someone who can manage admins.
"""

from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A new enum value can't be used in the transaction that adds it.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'")
    op.execute(
        """
        UPDATE users SET role = 'super_admin'
        WHERE id = (
            SELECT id FROM users WHERE role = 'admin' AND is_active ORDER BY created_at LIMIT 1
        )
        AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'super_admin')
        """
    )


def downgrade() -> None:
    # Postgres can't drop an enum value; super admins go back to plain admins.
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'super_admin'")

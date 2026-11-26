"""Add authentication lock fields and optional audit request

Revision ID: 20261123_0002
Revises: 20261122_0001
"""
from alembic import op
import sqlalchemy as sa

revision = "20261123_0002"
down_revision = "20261122_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("audit_events", "request_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.alter_column("audit_events", "request_id", existing_type=sa.Integer(), nullable=False)
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_count")

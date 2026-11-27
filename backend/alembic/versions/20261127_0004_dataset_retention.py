"""EZW-47: dataset retention period (retention_days)"""
from alembic import op
import sqlalchemy as sa

revision = "20261127_0004"
down_revision = "20261127_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasets", sa.Column("retention_days", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_datasets_retention_days", "datasets",
        "retention_days IS NULL OR retention_days > 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_datasets_retention_days", "datasets", type_="check")
    op.drop_column("datasets", "retention_days")
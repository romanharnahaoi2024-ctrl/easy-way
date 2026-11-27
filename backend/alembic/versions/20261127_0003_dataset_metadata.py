"""EZW-46: dataset catalog metadata (title, classification, owner, description)"""
from alembic import op
import sqlalchemy as sa

revision = "20261127_0003"
down_revision = "20261123_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasets", sa.Column("title", sa.String(128), nullable=True))
    op.add_column("datasets", sa.Column("classification", sa.String(32), nullable=True))
    op.add_column("datasets", sa.Column("owner", sa.String(128), nullable=True))
    op.add_column("datasets", sa.Column("description", sa.String(512), nullable=True))


def downgrade() -> None:
    for name in ("description", "owner", "classification", "title"):
        op.drop_column("datasets", name)

"""add token_usage to news_analysis

Revision ID: 9d1f2a3b4c5d
Revises: 4088347b97f4
Create Date: 2026-05-08

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "9d1f2a3b4c5d"
down_revision: str | None = "4088347b97f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("news_analysis", sa.Column("token_usage", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("news_analysis", "token_usage")

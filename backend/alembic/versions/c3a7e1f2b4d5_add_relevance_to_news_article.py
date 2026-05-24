"""add relevance column to news_article

Revision ID: c3a7e1f2b4d5
Revises: ba15b7c9b666
Create Date: 2026-05-24 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3a7e1f2b4d5"
down_revision: str | None = "ba15b7c9b666"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "news_article",
        sa.Column("relevance", sa.String(16), nullable=True),
    )
    op.create_index(
        "ix_news_relevance_pending",
        "news_article",
        ["relevance"],
        postgresql_where="relevance IS NULL",
    )


def downgrade() -> None:
    op.drop_index("ix_news_relevance_pending", table_name="news_article")
    op.drop_column("news_article", "relevance")

"""news_analysis table

Adds the ``news_analysis`` table that holds structured per-article AI tags
(direction, event_type, time_horizon, intensity, ...). One row per
(news_id, prompt_version) so we can re-tag everything on schema bumps
without losing history.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-29
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "news_analysis",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("news_id", sa.Integer(), nullable=False),
        sa.Column("prompt_version", sa.String(length=16), nullable=False),
        sa.Column("model_used", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="done",
        ),
        sa.Column("is_actionable", sa.Boolean(), nullable=True),
        sa.Column("primary_asset", sa.String(length=16), nullable=True),
        sa.Column("assets", sa.JSON(), nullable=True),
        sa.Column("direction", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("magnitude", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("confidence_reason", sa.Text(), nullable=True),
        sa.Column(
            "event_type",
            sa.String(length=24),
            nullable=False,
            server_default="OTHER",
        ),
        sa.Column(
            "time_horizon",
            sa.String(length=16),
            nullable=False,
            server_default="INTRADAY",
        ),
        sa.Column("intensity", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column(
            "relevance_score",
            sa.SmallInteger(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("raw_quote", sa.Text(), nullable=True),
        sa.Column("summary_zh", sa.Text(), nullable=True),
        sa.Column("raw_output", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("accuracy", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["news_id"], ["news_article.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "news_id", "prompt_version", name="uq_news_analysis_version"
        ),
    )
    op.create_index("ix_news_analysis_news", "news_analysis", ["news_id"])
    op.create_index(
        "ix_news_analysis_asset_time",
        "news_analysis",
        ["primary_asset", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_news_analysis_event",
        "news_analysis",
        ["event_type", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_news_analysis_event", table_name="news_analysis")
    op.drop_index("ix_news_analysis_asset_time", table_name="news_analysis")
    op.drop_index("ix_news_analysis_news", table_name="news_analysis")
    op.drop_table("news_analysis")

"""add futures_metric table

Revision ID: f9c0d1e2f345
Revises: f8a9b0c1d234
Create Date: 2026-05-07

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import NUMERIC

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f9c0d1e2f345"
down_revision: str | None = "f8a9b0c1d234"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "futures_metric",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("exchange", sa.String(length=32), nullable=False),
        sa.Column("funding_rate", NUMERIC(precision=16, scale=8), nullable=True),
        sa.Column("open_interest", NUMERIC(precision=24, scale=4), nullable=True),
        sa.Column("long_short_ratio", NUMERIC(precision=10, scale=4), nullable=True),
        sa.Column("long_account_pct", NUMERIC(precision=8, scale=4), nullable=True),
        sa.Column("short_account_pct", NUMERIC(precision=8, scale=4), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("symbol", "exchange", "timestamp", name="uq_futures_metric"),
    )
    op.create_index(
        "ix_futures_lookup",
        "futures_metric",
        ["symbol", "exchange", sa.text("timestamp DESC")],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_futures_lookup", table_name="futures_metric")
    op.drop_table("futures_metric")

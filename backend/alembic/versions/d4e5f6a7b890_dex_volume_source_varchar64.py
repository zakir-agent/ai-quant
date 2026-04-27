"""dex_volume: extend source column to VARCHAR(64)

Revision ID: d4e5f6a7b890
Revises: c3d4e5f6a789
Create Date: 2026-04-27

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4e5f6a7b890"
down_revision: str | None = "c3d4e5f6a789"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "dex_volume",
        "source",
        existing_type=sa.String(length=16),
        type_=sa.String(length=64),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "dex_volume",
        "source",
        existing_type=sa.String(length=64),
        type_=sa.String(length=16),
        existing_nullable=False,
    )

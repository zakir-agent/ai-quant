"""dex_volume: source column for data provenance (no-op if already present)

Revision ID: e7f2a8c90123
Revises: cb39399457bb
Create Date: 2026-04-27

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e7f2a8c90123"
down_revision: str | None = "cb39399457bb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("dex_volume")}
    if "source" not in cols:
        op.add_column(
            "dex_volume",
            sa.Column(
                "source",
                sa.String(length=64),
                nullable=False,
                server_default="dexscreener",
            ),
        )
        op.alter_column("dex_volume", "source", server_default=None)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("dex_volume")}
    if "source" in cols:
        op.drop_column("dex_volume", "source")

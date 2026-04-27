"""dex_volume: include source in unique constraint

Revision ID: c3d4e5f6a789
Revises: f8a9b0c1d234
Create Date: 2026-04-27

"""

from collections.abc import Sequence

from alembic import op

revision: str = "c3d4e5f6a789"
down_revision: str | None = "f8a9b0c1d234"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("uq_dex_volume", "dex_volume", type_="unique")
    op.create_unique_constraint(
        "uq_dex_volume",
        "dex_volume",
        ["source", "chain", "dex", "pair", "timestamp"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_dex_volume", "dex_volume", type_="unique")
    op.create_unique_constraint(
        "uq_dex_volume",
        "dex_volume",
        ["chain", "dex", "pair", "timestamp"],
    )

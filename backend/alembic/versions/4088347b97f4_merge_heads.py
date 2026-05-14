"""merge heads

Revision ID: 4088347b97f4
Revises: b2c3d4e5f6a7, f9c0d1e2f345
Create Date: 2026-05-08 14:26:45.832539

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "4088347b97f4"
down_revision: str | None = ("b2c3d4e5f6a7", "f9c0d1e2f345")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

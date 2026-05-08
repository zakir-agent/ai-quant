"""merge heads

Revision ID: 4088347b97f4
Revises: b2c3d4e5f6a7, f9c0d1e2f345
Create Date: 2026-05-08 14:26:45.832539

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4088347b97f4'
down_revision: Union[str, None] = ('b2c3d4e5f6a7', 'f9c0d1e2f345')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

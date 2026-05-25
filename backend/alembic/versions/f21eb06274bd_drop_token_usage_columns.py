"""drop token_usage columns

Revision ID: f21eb06274bd
Revises: c442627bb43d
Create Date: 2026-05-25 16:21:22.810334

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f21eb06274bd'
down_revision: Union[str, None] = 'c442627bb43d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('analysis_report', 'token_usage')
    op.drop_column('news_analysis', 'token_usage')


def downgrade() -> None:
    op.add_column('news_analysis', sa.Column('token_usage', postgresql.JSON(astext_type=sa.Text()), autoincrement=False, nullable=True))
    op.add_column('analysis_report', sa.Column('token_usage', postgresql.JSON(astext_type=sa.Text()), autoincrement=False, nullable=True))

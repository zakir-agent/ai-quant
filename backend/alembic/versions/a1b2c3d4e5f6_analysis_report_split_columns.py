"""analysis_report split columns

Adds first-class JSON columns for key_observations / risk_warnings /
technical_analysis / accuracy on `analysis_report`, and back-fills the
new columns from the legacy `data_sources` blob so existing reports keep
their detail data after the structural change.

Revision ID: a1b2c3d4e5f6
Revises: d4e5f6a7b890
Create Date: 2026-04-29
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "d4e5f6a7b890"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "analysis_report",
        sa.Column("key_observations", sa.JSON(), nullable=True),
    )
    op.add_column(
        "analysis_report",
        sa.Column("risk_warnings", sa.JSON(), nullable=True),
    )
    op.add_column(
        "analysis_report",
        sa.Column("technical_analysis", sa.JSON(), nullable=True),
    )
    op.add_column(
        "analysis_report",
        sa.Column("accuracy", sa.JSON(), nullable=True),
    )

    # Back-fill: the previous engine stored technical_analysis under
    # data_sources->'technical_analysis' and accuracy fields directly on
    # data_sources. Move them into the new dedicated columns so the UI keeps
    # working for historical rows.
    #
    # Note: ``data_sources`` is plain ``json`` (not ``jsonb``), so we cast to
    # ``jsonb`` before using the ``?`` / ``->`` operators that need it.
    op.execute(
        """
        UPDATE analysis_report
        SET technical_analysis = (data_sources::jsonb -> 'technical_analysis')::json
        WHERE (data_sources::jsonb) ? ('technical_analysis')::text
        """
    )
    op.execute(
        """
        UPDATE analysis_report
        SET accuracy = jsonb_build_object(
            'scored', COALESCE(data_sources::jsonb -> 'accuracy_scored', 'false'::jsonb),
            'accuracy_pct', data_sources::jsonb -> 'accuracy_24h',
            'details', data_sources::jsonb -> 'accuracy_details'
        )::json
        WHERE (data_sources::jsonb) ? ('accuracy_scored')::text
        """
    )


def downgrade() -> None:
    op.drop_column("analysis_report", "accuracy")
    op.drop_column("analysis_report", "technical_analysis")
    op.drop_column("analysis_report", "risk_warnings")
    op.drop_column("analysis_report", "key_observations")

"""telegram_message_log: outbound TG message audit

Revision ID: f8a9b0c1d234
Revises: e7f2a8c90123
Create Date: 2026-04-27

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f8a9b0c1d234"
down_revision: str | None = "e7f2a8c90123"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "telegram_message_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("message_body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("telegram_message_id", sa.BigInteger(), nullable=True),
        sa.Column("chat_id_masked", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_telegram_message_log_created",
        "telegram_message_log",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_telegram_message_log_created", table_name="telegram_message_log")
    op.drop_table("telegram_message_log")

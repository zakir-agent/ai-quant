"""Structured AI analysis of individual news articles.

A separate table (rather than columns on `news_article`) lets us:
- re-analyze an article when prompts/schemas change (`prompt_version` is part
  of the unique key);
- keep audit history (failed parses, retries, manual overrides);
- index by asset / event_type / direction without bloating the news table.
"""

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow():
    return datetime.now(UTC)


class NewsAnalysis(Base):
    __tablename__ = "news_analysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    news_id: Mapped[int] = mapped_column(
        ForeignKey("news_article.id", ondelete="CASCADE"), nullable=False
    )
    prompt_version: Mapped[str] = mapped_column(String(16), nullable=False)
    model_used: Mapped[str] = mapped_column(String(64), nullable=False)

    # ``done`` = parsed + persisted. ``failed`` = LLM call OK but JSON did
    # not validate. ``skipped`` = LLM declined / not actionable.
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="done")

    is_actionable: Mapped[bool | None] = mapped_column(nullable=True)
    primary_asset: Mapped[str | None] = mapped_column(String(16), nullable=True)
    assets: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Direction/magnitude are kept separate so neutral-but-loud and
    # bullish-but-mild stay distinguishable in aggregations.
    direction: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    magnitude: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    confidence_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    event_type: Mapped[str] = mapped_column(String(24), nullable=False, default="OTHER")
    time_horizon: Mapped[str] = mapped_column(
        String(16), nullable=False, default="INTRADAY"
    )
    intensity: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    relevance_score: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0
    )

    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    raw_quote: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_zh: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Snapshot of the raw model output, plus error trace if status=failed.
    token_usage: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    raw_output: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 24h accuracy review — written by the accuracy tracker.
    accuracy: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    __table_args__ = (
        UniqueConstraint("news_id", "prompt_version", name="uq_news_analysis_version"),
        Index("ix_news_analysis_news", "news_id"),
        Index("ix_news_analysis_asset_time", "primary_asset", created_at.desc()),
        Index("ix_news_analysis_event", "event_type", created_at.desc()),
    )

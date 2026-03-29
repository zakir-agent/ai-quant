from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow():
    return datetime.now(UTC)


class AnalysisReport(Base):
    __tablename__ = "analysis_report"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scope: Mapped[str] = mapped_column(String(32), nullable=False)  # "market" / "BTC"
    model_used: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt_version: Mapped[str] = mapped_column(
        String(16), nullable=False, default="v1"
    )
    sentiment_score: Mapped[int] = mapped_column(Integer, nullable=False)  # -100 ~ +100
    trend: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # bullish/bearish/neutral
    risk_level: Mapped[str] = mapped_column(
        String(16), nullable=False, default="medium"
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    recommendations: Mapped[dict] = mapped_column(JSON, nullable=True)
    data_sources: Mapped[dict] = mapped_column(JSON, nullable=True)
    token_usage: Mapped[dict] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    __table_args__ = (Index("ix_analysis_scope_time", "scope", created_at.desc()),)

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow():
    return datetime.now(UTC)


class AnalysisReport(Base):
    __tablename__ = "analysis_report"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scope: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # "market" / "BTC/USDT"
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

    # AI structured output — promoted to first-class columns so detail pages and
    # downstream consumers don't have to peek into a JSON blob.
    key_observations: Mapped[list | None] = mapped_column(JSON, nullable=True)
    recommendations: Mapped[list | None] = mapped_column(JSON, nullable=True)
    risk_warnings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    technical_analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Snapshot of the inputs we fed to the model — kept for audit/debug only.
    data_sources: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    token_usage: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Populated asynchronously by the accuracy tracker once enough time has
    # passed. Separate column keeps audit data clean and indexable.
    accuracy: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    __table_args__ = (Index("ix_analysis_scope_time", "scope", created_at.desc()),)

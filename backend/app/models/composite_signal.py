from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CompositeSignal(Base):
    """Persisted snapshot of a weighted composite trading signal.

    Written on schedule by ``signal_aggregator.persist_all_signals`` so the
    accuracy of composite signals can later be compared against pure AI
    recommendations.
    """

    __tablename__ = "composite_signal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    composite_score: Mapped[float] = mapped_column(Float, nullable=False)  # -100 ~ +100
    signal: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # strong_buy/buy/neutral/sell/strong_sell
    confidence: Mapped[str] = mapped_column(String(16), nullable=False)  # high/med/low
    components: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Weights used for this run — kept per-row so historical signals stay
    # interpretable after DEFAULT_WEIGHTS is re-tuned.
    weights: Mapped[dict] = mapped_column(JSON, nullable=False)

    # Populated asynchronously by signal_accuracy once the evaluation window
    # has elapsed. NULL = not yet evaluated.
    accuracy: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

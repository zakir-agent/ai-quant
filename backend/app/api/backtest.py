import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.composite_signal import CompositeSignal

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backtest", tags=["backtest"])


def _signal_to_dict(row: CompositeSignal) -> dict:
    return {
        "id": row.id,
        "symbol": row.symbol,
        "composite_score": row.composite_score,
        "signal": row.signal,
        "confidence": row.confidence,
        "components": row.components,
        "weights": row.weights,
        "accuracy": row.accuracy,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/evaluate")
async def evaluate_recommendations(
    days: int = Query(30, ge=1, le=365, description="Lookback period in days"),
    symbol: str | None = Query(None, description="Filter by symbol"),
):
    """Evaluate AI recommendation accuracy against actual price outcomes."""
    from app.services.backtester import evaluate_recommendations as evaluate

    return await evaluate(days=days, symbol=symbol)


@router.get("/simulate")
async def simulate_portfolio(
    days: int = Query(30, ge=1, le=365, description="Lookback period in days"),
    initial_capital: float = Query(10000, ge=100, description="Starting capital (USD)"),
    position_size_pct: float = Query(
        10, ge=1, le=50, description="Position size as % of capital"
    ),
    stop_loss_pct: float = Query(5, ge=1, le=20, description="Stop loss %"),
    take_profit_pct: float = Query(10, ge=2, le=50, description="Take profit %"),
):
    """Simulate following AI recommendations with virtual capital."""
    from app.services.backtester import simulate_portfolio as simulate

    return await simulate(
        initial_capital=initial_capital,
        days=days,
        position_size_pct=position_size_pct,
        stop_loss_pct=stop_loss_pct,
        take_profit_pct=take_profit_pct,
    )


@router.get("/accuracy")
async def get_accuracy():
    """Get rolling AI recommendation accuracy stats (7d / 30d)."""
    from app.services.accuracy_tracker import get_accuracy_stats

    return await get_accuracy_stats()


@router.get("/signal")
async def get_composite_signal(
    symbol: str = Query("BTC/USDT", description="Trading pair"),
):
    """Get weighted composite trading signal combining technical + AI + sentiment."""
    from app.services.signal_aggregator import generate_composite_signal

    return await generate_composite_signal(symbol=symbol)


@router.get("/signals")
async def get_all_signals():
    """Get composite signals for all tracked symbols."""
    from app.services.signal_aggregator import generate_all_signals

    return {"signals": await generate_all_signals()}


@router.get("/signals/recent")
async def get_persisted_signals(
    symbol: str | None = Query(
        None, description="Trading pair; returns history for that symbol when set"
    ),
    limit: int = Query(50, ge=1, le=500, description="Max history rows per symbol"),
    db: AsyncSession = Depends(get_db),
):
    """Persisted composite signals.

    Without ``symbol``: the latest stored signal per symbol.
    With ``symbol``: that symbol's history, newest first, up to ``limit``.
    """
    try:
        if symbol:
            stmt = (
                select(CompositeSignal)
                .where(CompositeSignal.symbol == symbol)
                .order_by(CompositeSignal.created_at.desc())
                .limit(limit)
            )
        else:
            # PostgreSQL DISTINCT ON: newest row per symbol
            stmt = (
                select(CompositeSignal)
                .distinct(CompositeSignal.symbol)
                .order_by(
                    CompositeSignal.symbol, CompositeSignal.created_at.desc()
                )
            )
        rows = (await db.execute(stmt)).scalars().all()
        return {"signals": [_signal_to_dict(r) for r in rows]}
    except Exception as exc:
        logger.exception("Failed to load persisted signals")
        raise HTTPException(
            status_code=503, detail="Failed to load persisted signals"
        ) from exc


@router.get("/signals/weights")
async def get_signal_weights():
    """Current effective composite signal weights (tuned or default) + tuning meta."""
    from app.services.signal_aggregator import DEFAULT_WEIGHTS
    from app.services.weight_tuner import get_tuning_info

    try:
        info = await get_tuning_info()
        if info and info.get("weights"):
            return {
                "weights": info["weights"],
                "weights_source": "tuned",
                "computed_at": info.get("computed_at"),
                "sample_count": info.get("sample_count"),
                "component_hit_rates": info.get("component_hit_rates"),
            }
        response: dict = {
            "weights": dict(DEFAULT_WEIGHTS),
            "weights_source": "default",
        }
        if info:  # tuning ran but had insufficient data
            response.update(
                {
                    "reason": info.get("reason"),
                    "computed_at": info.get("computed_at"),
                    "sample_count": info.get("sample_count"),
                    "component_hit_rates": info.get("component_hit_rates"),
                }
            )
        return response
    except Exception as exc:
        logger.exception("Failed to load signal weights")
        raise HTTPException(
            status_code=503, detail="Failed to load signal weights"
        ) from exc


@router.get("/signals/accuracy")
async def get_signal_accuracy():
    """Rolling composite signal accuracy stats (7d/30d, bucketed by strength)."""
    from app.services.signal_accuracy import get_signal_accuracy_stats

    try:
        return await get_signal_accuracy_stats()
    except Exception as exc:
        logger.exception("Failed to compute signal accuracy stats")
        raise HTTPException(
            status_code=503, detail="Failed to compute signal accuracy stats"
        ) from exc

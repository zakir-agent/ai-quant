from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


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
    position_size_pct: float = Query(10, ge=1, le=50, description="Position size as % of capital"),
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

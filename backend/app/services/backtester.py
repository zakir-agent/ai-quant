"""Backtesting engine — evaluate AI recommendation accuracy against actual price data.

Two modes:
1. evaluate_recommendations() — score past buy/sell/hold signals against actual outcomes
2. simulate_portfolio() — simulate following AI recommendations with virtual capital
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.analysis import AnalysisReport
from app.models.market import OHLCVData

logger = logging.getLogger(__name__)

# Evaluation windows (hours after recommendation)
EVAL_WINDOWS = [1, 4, 24, 168]  # 1h, 4h, 24h, 7d


async def evaluate_recommendations(
    days: int = 30,
    symbol: str | None = None,
) -> dict:
    """Evaluate accuracy of past AI recommendations against actual price movements.

    For each buy/sell recommendation, check what actually happened at 1h/4h/24h/7d.
    A 'buy' is correct if price went up; 'sell' is correct if price went down.

    Returns aggregate accuracy stats and per-recommendation details.
    """
    cutoff = datetime.now(UTC) - timedelta(days=days)

    async with async_session() as session:
        # Get all reports with recommendations
        stmt = (
            select(AnalysisReport)
            .where(AnalysisReport.created_at >= cutoff)
            .order_by(AnalysisReport.created_at.asc())
        )
        if symbol:
            stmt = stmt.where(AnalysisReport.scope == symbol)

        result = await session.execute(stmt)
        reports = result.scalars().all()

        if not reports:
            return {"error": "No reports found in the given period", "details": []}

        evaluations = []
        stats = {
            "total_recommendations": 0,
            "actionable": 0,  # buy or sell (not watch/hold)
            "correct": {f"{w}h": 0 for w in EVAL_WINDOWS},
            "incorrect": {f"{w}h": 0 for w in EVAL_WINDOWS},
            "no_data": {f"{w}h": 0 for w in EVAL_WINDOWS},
            "accuracy": {f"{w}h": None for w in EVAL_WINDOWS},
            "avg_return": {f"{w}h": 0.0 for w in EVAL_WINDOWS},
        }

        for report in reports:
            recs = report.recommendations or []
            if not isinstance(recs, list):
                continue

            for rec in recs:
                rec_symbol = rec.get("symbol", "")
                action = rec.get("action", "").lower()
                stats["total_recommendations"] += 1

                if action not in ("buy", "sell"):
                    continue

                stats["actionable"] += 1

                # Get price at recommendation time
                price_at_rec = await _get_price_at_time(
                    session, rec_symbol, report.created_at
                )
                if price_at_rec is None:
                    for w in EVAL_WINDOWS:
                        stats["no_data"][f"{w}h"] += 1
                    continue

                eval_entry = {
                    "report_id": report.id,
                    "report_time": report.created_at.isoformat(),
                    "symbol": rec_symbol,
                    "action": action,
                    "confidence": rec.get("confidence", "unknown"),
                    "price_at_recommendation": price_at_rec,
                    "target_price": rec.get("target_price"),
                    "stop_loss": rec.get("stop_loss"),
                    "outcomes": {},
                }

                # Check each evaluation window
                for window_h in EVAL_WINDOWS:
                    future_time = report.created_at + timedelta(hours=window_h)
                    if future_time > datetime.now(UTC):
                        eval_entry["outcomes"][f"{window_h}h"] = "pending"
                        continue

                    future_price = await _get_price_at_time(
                        session, rec_symbol, future_time
                    )
                    if future_price is None:
                        stats["no_data"][f"{window_h}h"] += 1
                        eval_entry["outcomes"][f"{window_h}h"] = "no_data"
                        continue

                    pct_change = (future_price - price_at_rec) / price_at_rec * 100

                    # Determine if correct
                    correct = pct_change > 0 if action == "buy" else pct_change < 0

                    key = f"{window_h}h"
                    if correct:
                        stats["correct"][key] += 1
                    else:
                        stats["incorrect"][key] += 1

                    eval_entry["outcomes"][f"{window_h}h"] = {
                        "price": future_price,
                        "change_pct": round(pct_change, 2),
                        "correct": correct,
                        # For buy: return is price change; for sell: return is -price change
                        "return_pct": round(
                            pct_change if action == "buy" else -pct_change, 2
                        ),
                    }

                evaluations.append(eval_entry)

        # Calculate aggregate accuracy
        for w in EVAL_WINDOWS:
            key = f"{w}h"
            total = stats["correct"][key] + stats["incorrect"][key]
            if total > 0:
                stats["accuracy"][key] = round(stats["correct"][key] / total * 100, 1)
                # Calculate average return across all evaluated recommendations
                returns = []
                for e in evaluations:
                    outcome = e["outcomes"].get(key)
                    if isinstance(outcome, dict) and "return_pct" in outcome:
                        returns.append(outcome["return_pct"])
                if returns:
                    stats["avg_return"][key] = round(sum(returns) / len(returns), 2)

    return {
        "period_days": days,
        "symbol_filter": symbol,
        "stats": stats,
        "details": evaluations,
    }


async def simulate_portfolio(
    initial_capital: float = 10000.0,
    days: int = 30,
    position_size_pct: float = 10.0,
    stop_loss_pct: float = 5.0,
    take_profit_pct: float = 10.0,
) -> dict:
    """Simulate following AI buy/sell recommendations with virtual capital.

    Rules:
    - On 'buy' with high/medium confidence: open a long position using position_size_pct of capital
    - On 'sell': close any open position for that symbol
    - Evaluate at next report time or use stop_loss/take_profit
    - Only track symbols we have OHLCV data for

    Returns portfolio equity curve and trade log.
    """
    cutoff = datetime.now(UTC) - timedelta(days=days)

    async with async_session() as session:
        stmt = (
            select(AnalysisReport)
            .where(
                AnalysisReport.created_at >= cutoff,
                AnalysisReport.scope == "market",
            )
            .order_by(AnalysisReport.created_at.asc())
        )
        result = await session.execute(stmt)
        reports = result.scalars().all()

        capital = initial_capital
        positions: dict[str, dict] = {}  # symbol -> {entry_price, size, amount}
        trades: list[dict] = []
        equity_curve: list[dict] = []

        for report in reports:
            recs = report.recommendations or []
            if not isinstance(recs, list):
                continue

            report_time = report.created_at

            # First: check stop-loss/take-profit for open positions
            for sym in list(positions.keys()):
                pos = positions[sym]
                current_price = await _get_price_at_time(session, sym, report_time)
                if current_price is None:
                    continue

                pnl_pct = (
                    (current_price - pos["entry_price"]) / pos["entry_price"] * 100
                )

                close_reason = None
                if pnl_pct <= -stop_loss_pct:
                    close_reason = "stop_loss"
                elif pnl_pct >= take_profit_pct:
                    close_reason = "take_profit"

                if close_reason:
                    pnl = (current_price - pos["entry_price"]) * pos["amount"]
                    capital += pos["size"] + pnl
                    trades.append(
                        {
                            "symbol": sym,
                            "action": "close",
                            "reason": close_reason,
                            "entry_price": pos["entry_price"],
                            "exit_price": current_price,
                            "amount": pos["amount"],
                            "pnl": round(pnl, 2),
                            "pnl_pct": round(pnl_pct, 2),
                            "entry_time": pos["entry_time"],
                            "exit_time": report_time.isoformat(),
                        }
                    )
                    del positions[sym]

            # Process recommendations
            for rec in recs:
                rec_symbol = rec.get("symbol", "")
                action = rec.get("action", "").lower()
                confidence = rec.get("confidence", "low").lower()

                if action == "buy" and confidence in ("high", "medium"):
                    if rec_symbol in positions:
                        continue  # Already have a position

                    entry_price = await _get_price_at_time(
                        session, rec_symbol, report_time
                    )
                    if entry_price is None or entry_price == 0:
                        continue

                    size = capital * (position_size_pct / 100)
                    if size > capital:
                        continue
                    amount = size / entry_price
                    capital -= size
                    positions[rec_symbol] = {
                        "entry_price": entry_price,
                        "size": size,
                        "amount": amount,
                        "entry_time": report_time.isoformat(),
                    }
                    trades.append(
                        {
                            "symbol": rec_symbol,
                            "action": "buy",
                            "reason": f"AI recommendation ({confidence})",
                            "entry_price": entry_price,
                            "amount": amount,
                            "size": round(size, 2),
                            "time": report_time.isoformat(),
                        }
                    )

                elif action == "sell" and rec_symbol in positions:
                    pos = positions[rec_symbol]
                    exit_price = await _get_price_at_time(
                        session, rec_symbol, report_time
                    )
                    if exit_price is None:
                        continue

                    pnl = (exit_price - pos["entry_price"]) * pos["amount"]
                    pnl_pct = (
                        (exit_price - pos["entry_price"]) / pos["entry_price"] * 100
                    )
                    capital += pos["size"] + pnl
                    trades.append(
                        {
                            "symbol": rec_symbol,
                            "action": "sell",
                            "reason": "AI recommendation",
                            "entry_price": pos["entry_price"],
                            "exit_price": exit_price,
                            "amount": pos["amount"],
                            "pnl": round(pnl, 2),
                            "pnl_pct": round(pnl_pct, 2),
                            "entry_time": pos["entry_time"],
                            "exit_time": report_time.isoformat(),
                        }
                    )
                    del positions[rec_symbol]

            # Record equity at this point
            total_equity = capital
            for sym, pos in positions.items():
                current = await _get_price_at_time(session, sym, report_time)
                if current:
                    total_equity += current * pos["amount"]
                else:
                    total_equity += pos["size"]  # fallback to entry value

            equity_curve.append(
                {
                    "time": report_time.isoformat(),
                    "equity": round(total_equity, 2),
                    "cash": round(capital, 2),
                    "open_positions": len(positions),
                }
            )

        # Close remaining positions at latest price for final accounting
        for sym in list(positions.keys()):
            pos = positions[sym]
            latest_price = await _get_latest_price(session, sym)
            if latest_price:
                pnl = (latest_price - pos["entry_price"]) * pos["amount"]
                pnl_pct = (latest_price - pos["entry_price"]) / pos["entry_price"] * 100
                trades.append(
                    {
                        "symbol": sym,
                        "action": "close",
                        "reason": "end_of_backtest (still open)",
                        "entry_price": pos["entry_price"],
                        "exit_price": latest_price,
                        "amount": pos["amount"],
                        "pnl": round(pnl, 2),
                        "pnl_pct": round(pnl_pct, 2),
                        "entry_time": pos["entry_time"],
                        "exit_time": datetime.now(UTC).isoformat(),
                    }
                )
                capital += pos["size"] + pnl

        final_equity = capital
        total_return = (final_equity - initial_capital) / initial_capital * 100

        # Calculate summary metrics
        completed_trades = [t for t in trades if "pnl" in t]
        winning = [t for t in completed_trades if t["pnl"] > 0]
        losing = [t for t in completed_trades if t["pnl"] < 0]

        max_drawdown = 0.0
        peak = initial_capital
        for point in equity_curve:
            equity = point["equity"]
            peak = max(peak, equity)
            drawdown = (peak - equity) / peak * 100
            max_drawdown = max(max_drawdown, drawdown)

        summary = {
            "initial_capital": initial_capital,
            "final_equity": round(final_equity, 2),
            "total_return_pct": round(total_return, 2),
            "max_drawdown_pct": round(max_drawdown, 2),
            "total_trades": len(completed_trades),
            "winning_trades": len(winning),
            "losing_trades": len(losing),
            "win_rate_pct": round(len(winning) / len(completed_trades) * 100, 1)
            if completed_trades
            else 0,
            "avg_win_pct": round(sum(t["pnl_pct"] for t in winning) / len(winning), 2)
            if winning
            else 0,
            "avg_loss_pct": round(sum(t["pnl_pct"] for t in losing) / len(losing), 2)
            if losing
            else 0,
            "profit_factor": round(
                sum(t["pnl"] for t in winning) / abs(sum(t["pnl"] for t in losing)),
                2,
            )
            if losing and sum(t["pnl"] for t in losing) != 0
            else None,
        }

    return {
        "period_days": days,
        "parameters": {
            "position_size_pct": position_size_pct,
            "stop_loss_pct": stop_loss_pct,
            "take_profit_pct": take_profit_pct,
        },
        "summary": summary,
        "trades": trades,
        "equity_curve": equity_curve,
    }


async def _get_price_at_time(
    session: AsyncSession, symbol: str, target_time: datetime
) -> float | None:
    """Get the closest OHLCV close price to the target time."""
    # Normalize symbol format (ensure slash separator)
    if "/" not in symbol:
        # Try BTC -> BTC/USDT
        symbol = f"{symbol}/USDT"

    # Find the closest 1h candle within ±2h
    window = timedelta(hours=2)
    stmt = (
        select(OHLCVData.close, OHLCVData.timestamp)
        .where(
            and_(
                OHLCVData.symbol == symbol,
                OHLCVData.timeframe == "1h",
                OHLCVData.timestamp >= target_time - window,
                OHLCVData.timestamp <= target_time + window,
            )
        )
        .order_by(
            # Order by proximity to target time
            OHLCVData.timestamp.asc()
        )
        .limit(5)
    )
    result = await session.execute(stmt)
    rows = result.all()
    if not rows:
        return None

    # Find closest to target_time
    best = min(rows, key=lambda r: abs((r[1] - target_time).total_seconds()))
    return float(best[0])


async def _get_latest_price(session: AsyncSession, symbol: str) -> float | None:
    """Get the most recent price for a symbol."""
    if "/" not in symbol:
        symbol = f"{symbol}/USDT"
    stmt = (
        select(OHLCVData.close)
        .where(OHLCVData.symbol == symbol, OHLCVData.timeframe == "1h")
        .order_by(OHLCVData.timestamp.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    return float(row) if row else None

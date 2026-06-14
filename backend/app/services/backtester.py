"""Backtesting engine — evaluate AI recommendation accuracy against actual price data.

Two modes:
1. evaluate_recommendations() — score past buy/sell/hold signals against actual outcomes
2. simulate_portfolio() — simulate following AI recommendations with virtual capital
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.database import async_session
from app.models.analysis import AnalysisReport
from app.services.price_cache import build_price_cache, normalize_symbol

logger = logging.getLogger(__name__)

# 4h, 24h, 7d. No 1h window: price lookups tolerate ±2h, so a 1h
# accuracy reading would be pure noise.
EVAL_WINDOWS = [4, 24, 168]


async def evaluate_recommendations(
    days: int = 30,
    symbol: str | None = None,
) -> dict:
    """Evaluate accuracy of past AI recommendations against actual price movements."""
    cutoff = datetime.now(UTC) - timedelta(days=days)

    async with async_session() as session:
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

        # Collect all unique symbols from recommendations
        all_symbols: set[str] = set()
        for report in reports:
            recs = report.recommendations or []
            if not isinstance(recs, list):
                continue
            for rec in recs:
                s = normalize_symbol(rec.get("symbol", ""))
                if s:
                    all_symbols.add(s)

        if not all_symbols:
            return {"error": "No actionable recommendations found", "details": []}

        # Bulk prefetch all price data
        end_time = datetime.now(UTC) + timedelta(hours=max(EVAL_WINDOWS) + 2)
        price_cache = await build_price_cache(
            session, list(all_symbols), cutoff, end_time
        )

        evaluations = []
        stats = {
            "total_recommendations": 0,
            "actionable": 0,
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

                price_at_rec = price_cache.get_price(rec_symbol, report.created_at)
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

                for window_h in EVAL_WINDOWS:
                    future_time = report.created_at + timedelta(hours=window_h)
                    if future_time > datetime.now(UTC):
                        eval_entry["outcomes"][f"{window_h}h"] = "pending"
                        continue

                    future_price = price_cache.get_price(rec_symbol, future_time)
                    if future_price is None:
                        stats["no_data"][f"{window_h}h"] += 1
                        eval_entry["outcomes"][f"{window_h}h"] = "no_data"
                        continue

                    pct_change = (future_price - price_at_rec) / price_at_rec * 100
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
    """Simulate following AI buy/sell recommendations with virtual capital."""
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

        # Collect all unique symbols from recommendations
        all_symbols: set[str] = set()
        for report in reports:
            recs = report.recommendations or []
            if not isinstance(recs, list):
                continue
            for rec in recs:
                s = normalize_symbol(rec.get("symbol", ""))
                if s:
                    all_symbols.add(s)

        if not all_symbols:
            return {
                "period_days": days,
                "parameters": {
                    "position_size_pct": position_size_pct,
                    "stop_loss_pct": stop_loss_pct,
                    "take_profit_pct": take_profit_pct,
                },
                "summary": {
                    "initial_capital": initial_capital,
                    "final_equity": initial_capital,
                    "total_return_pct": 0,
                    "max_drawdown_pct": 0,
                    "total_trades": 0,
                    "winning_trades": 0,
                    "losing_trades": 0,
                    "win_rate_pct": 0,
                    "avg_win_pct": 0,
                    "avg_loss_pct": 0,
                    "profit_factor": None,
                },
                "trades": [],
                "equity_curve": [],
            }

        # Bulk prefetch all price data
        end_time = datetime.now(UTC) + timedelta(hours=max(EVAL_WINDOWS) + 2)
        price_cache = await build_price_cache(
            session, list(all_symbols), cutoff, end_time
        )

        capital = initial_capital
        positions: dict[str, dict] = {}
        trades: list[dict] = []
        equity_curve: list[dict] = []

        for report in reports:
            recs = report.recommendations or []
            if not isinstance(recs, list):
                continue

            report_time = report.created_at

            # Check stop-loss/take-profit for open positions
            for sym in list(positions.keys()):
                pos = positions[sym]
                current_price = price_cache.get_price(sym, report_time)
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
                        continue

                    entry_price = price_cache.get_price(rec_symbol, report_time)
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
                    exit_price = price_cache.get_price(rec_symbol, report_time)
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

            # Record equity
            total_equity = capital
            for sym, pos in positions.items():
                current = price_cache.get_price(sym, report_time)
                if current:
                    total_equity += current * pos["amount"]
                else:
                    total_equity += pos["size"]

            equity_curve.append(
                {
                    "time": report_time.isoformat(),
                    "equity": round(total_equity, 2),
                    "cash": round(capital, 2),
                    "open_positions": len(positions),
                }
            )

        # Close remaining positions at latest price
        for sym in list(positions.keys()):
            pos = positions[sym]
            latest_price = price_cache.get_latest_price(sym)
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

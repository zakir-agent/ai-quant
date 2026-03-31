"""Automatic AI recommendation accuracy tracker.

Runs on schedule to evaluate past recommendations that have matured
(enough time has passed to check the outcome). Stores results in the
analysis_report.data_sources JSON field for historical tracking.

Also computes a rolling accuracy score visible on the dashboard.
"""

import json
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, select, update

from app.database import async_session
from app.models.analysis import AnalysisReport
from app.models.market import OHLCVData
from app.services.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

# Evaluate after these hours have passed
EVAL_WINDOW_HOURS = 24


async def score_matured_recommendations() -> int:
    """Find and score recommendations that are old enough to evaluate.

    Looks for reports older than EVAL_WINDOW_HOURS that haven't been scored yet.
    Updates the report's data_sources field with accuracy data.

    Returns number of reports scored.
    """
    cutoff = datetime.now(UTC) - timedelta(hours=EVAL_WINDOW_HOURS)
    scored = 0

    async with async_session() as session:
        # Find unscored reports older than the evaluation window
        stmt = (
            select(AnalysisReport)
            .where(
                AnalysisReport.created_at <= cutoff,
            )
            .order_by(AnalysisReport.created_at.asc())
        )
        result = await session.execute(stmt)
        reports = result.scalars().all()

        for report in reports:
            # Skip if already scored
            ds = report.data_sources or {}
            if ds.get("accuracy_scored"):
                continue

            recs = report.recommendations
            if not isinstance(recs, list) or not recs:
                continue

            accuracy_data = []
            correct_count = 0
            total_actionable = 0

            for rec in recs:
                symbol = rec.get("symbol", "")
                action = rec.get("action", "").lower()

                if action not in ("buy", "sell"):
                    continue

                total_actionable += 1

                # Get price at recommendation time
                price_then = await _get_price_near(session, symbol, report.created_at)
                if price_then is None:
                    continue

                # Get price after EVAL_WINDOW_HOURS
                future_time = report.created_at + timedelta(hours=EVAL_WINDOW_HOURS)
                price_after = await _get_price_near(session, symbol, future_time)
                if price_after is None:
                    continue

                change_pct = (price_after - price_then) / price_then * 100
                correct = (action == "buy" and change_pct > 0) or (
                    action == "sell" and change_pct < 0
                )

                if correct:
                    correct_count += 1

                # Check target/stop hit
                target = rec.get("target_price")
                stop = rec.get("stop_loss")
                target_hit = target is not None and (
                    (action == "buy" and price_after >= target)
                    or (action == "sell" and price_after <= target)
                )
                stop_hit = stop is not None and (
                    (action == "buy" and price_after <= stop)
                    or (action == "sell" and price_after >= stop)
                )

                accuracy_data.append(
                    {
                        "symbol": symbol,
                        "action": action,
                        "price_at_rec": round(price_then, 2),
                        "price_after_24h": round(price_after, 2),
                        "change_pct": round(change_pct, 2),
                        "correct": correct,
                        "return_pct": round(
                            change_pct if action == "buy" else -change_pct, 2
                        ),
                        "target_hit": target_hit,
                        "stop_hit": stop_hit,
                    }
                )

            if not accuracy_data:
                continue

            # Update the report with accuracy data
            accuracy_pct = (
                round(correct_count / total_actionable * 100, 1)
                if total_actionable > 0
                else None
            )
            ds["accuracy_scored"] = True
            ds["accuracy_24h"] = accuracy_pct
            ds["accuracy_details"] = accuracy_data

            stmt_update = (
                update(AnalysisReport)
                .where(AnalysisReport.id == report.id)
                .values(data_sources=ds)
            )
            await session.execute(stmt_update)
            scored += 1

        await session.commit()

    # Update rolling accuracy in cache
    if scored > 0:
        await _update_rolling_accuracy()

    logger.info(f"Scored {scored} matured reports")
    return scored


async def _update_rolling_accuracy():
    """Calculate and cache rolling accuracy stats for the last 7 and 30 days."""
    stats = {}

    async with async_session() as session:
        for days_label, days in [("7d", 7), ("30d", 30)]:
            cutoff = datetime.now(UTC) - timedelta(days=days)
            stmt = select(AnalysisReport).where(
                AnalysisReport.created_at >= cutoff,
            )
            result = await session.execute(stmt)
            reports = result.scalars().all()

            total_correct = 0
            total_actionable = 0
            total_return = 0.0
            scored_reports = 0

            for r in reports:
                ds = r.data_sources or {}
                details = ds.get("accuracy_details", [])
                if not details:
                    continue
                scored_reports += 1
                for d in details:
                    total_actionable += 1
                    if d.get("correct"):
                        total_correct += 1
                    total_return += d.get("return_pct", 0)

            stats[days_label] = {
                "accuracy_pct": round(total_correct / total_actionable * 100, 1)
                if total_actionable > 0
                else None,
                "avg_return_pct": round(total_return / total_actionable, 2)
                if total_actionable > 0
                else None,
                "total_recommendations": total_actionable,
                "scored_reports": scored_reports,
            }

    await cache_set("analysis:accuracy", json.dumps(stats), ttl=3600)
    return stats


async def get_accuracy_stats() -> dict:
    """Get cached rolling accuracy stats."""
    data = await cache_get("analysis:accuracy")
    if data:
        return json.loads(data)
    return await _update_rolling_accuracy()


async def _get_price_near(session, symbol: str, target_time: datetime) -> float | None:
    """Get closest 1h candle close price within ±2h of target time."""
    if "/" not in symbol:
        symbol = f"{symbol}/USDT"

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
        .limit(5)
    )
    result = await session.execute(stmt)
    rows = result.all()
    if not rows:
        return None
    best = min(rows, key=lambda r: abs((r[1] - target_time).total_seconds()))
    return float(best[0])

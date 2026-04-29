"""Automatic AI recommendation accuracy tracker.

Runs on schedule to evaluate past recommendations that have matured (enough
time has passed to check the outcome). Results land in the dedicated
``analysis_report.accuracy`` JSON column rather than being stuffed back into
``data_sources``.

The cached rolling stats power the dashboard's accuracy widget.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.analysis import AnalysisReport
from app.models.market import OHLCVData
from app.services.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

# Evaluate after these hours have passed
EVAL_WINDOW_HOURS = 24


async def score_matured_recommendations() -> int:
    """Find and score recommendations that are old enough to evaluate.

    Looks for reports older than ``EVAL_WINDOW_HOURS`` whose ``accuracy``
    column hasn't been populated yet. Returns the number of reports scored.
    """
    cutoff = datetime.now(UTC) - timedelta(hours=EVAL_WINDOW_HOURS)
    scored = 0

    async with async_session() as session:
        stmt = (
            select(AnalysisReport)
            .where(AnalysisReport.created_at <= cutoff)
            .order_by(AnalysisReport.created_at.asc())
        )
        reports = (await session.execute(stmt)).scalars().all()

        for report in reports:
            if _already_scored(report):
                continue
            accuracy = await _score_one(session, report)
            if accuracy is None:
                continue
            await session.execute(
                update(AnalysisReport)
                .where(AnalysisReport.id == report.id)
                .values(accuracy=accuracy)
            )
            scored += 1

        await session.commit()

    if scored > 0:
        await _update_rolling_accuracy()

    logger.info("Scored %s matured reports", scored)
    return scored


def _already_scored(report: AnalysisReport) -> bool:
    return bool((report.accuracy or {}).get("scored"))


async def _score_one(
    session: AsyncSession, report: AnalysisReport
) -> dict[str, Any] | None:
    recs = report.recommendations
    if not isinstance(recs, list) or not recs:
        return None

    details: list[dict] = []
    correct_count = 0
    total_actionable = 0

    for rec in recs:
        action = (rec.get("action") or "").lower()
        if action not in ("buy", "sell"):
            continue
        symbol = rec.get("symbol") or _infer_symbol_from_scope(report.scope)
        if not symbol:
            continue
        total_actionable += 1

        price_then = await _get_price_near(session, symbol, report.created_at)
        if price_then is None:
            continue

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

        details.append(
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

    if not details:
        return None

    accuracy_pct = (
        round(correct_count / total_actionable * 100, 1)
        if total_actionable > 0
        else None
    )
    return {
        "scored": True,
        "evaluated_at": datetime.now(UTC).isoformat(),
        "window_hours": EVAL_WINDOW_HOURS,
        "accuracy_pct": accuracy_pct,
        "details": details,
    }


def _infer_symbol_from_scope(scope: str) -> str | None:
    """Symbol-scoped reports often skip ``rec.symbol``; fall back to the scope."""
    if scope == "market" or not scope:
        return None
    return scope


async def _update_rolling_accuracy() -> dict:
    """Calculate and cache rolling accuracy stats for the last 7 and 30 days."""
    stats: dict[str, dict] = {}

    async with async_session() as session:
        for days_label, days in (("7d", 7), ("30d", 30)):
            cutoff = datetime.now(UTC) - timedelta(days=days)
            stmt = select(AnalysisReport).where(AnalysisReport.created_at >= cutoff)
            reports = (await session.execute(stmt)).scalars().all()

            total_correct = 0
            total_actionable = 0
            total_return = 0.0
            scored_reports = 0

            for r in reports:
                acc = r.accuracy or {}
                details = acc.get("details") or []
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
    """Return cached rolling accuracy stats, recomputing on cache miss."""
    data = await cache_get("analysis:accuracy")
    if data:
        return json.loads(data)
    return await _update_rolling_accuracy()


async def _get_price_near(
    session: AsyncSession, symbol: str, target_time: datetime
) -> float | None:
    """Get closest 1h candle close price within ±2h of ``target_time``."""
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
    rows = (await session.execute(stmt)).all()
    if not rows:
        return None
    best = min(rows, key=lambda r: abs((r[1] - target_time).total_seconds()))
    return float(best[0])

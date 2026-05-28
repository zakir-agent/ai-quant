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

from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings, get_time_horizon_hours
from app.database import async_session
from app.models.analysis import AnalysisReport
from app.models.news_analysis import NewsAnalysis
from app.services.cache import cache_get, cache_set
from app.services.price_cache import build_price_cache_from_requests, normalize_symbol

logger = logging.getLogger(__name__)


def _get_eval_window_hours(time_horizon: str | None) -> int:
    """Return evaluation window hours based on time_horizon, with fallback."""
    if time_horizon:
        mapping = get_time_horizon_hours()
        return mapping.get(time_horizon, get_settings().accuracy_eval_window_hours)
    return get_settings().accuracy_eval_window_hours


def _min_eval_window_hours() -> int:
    """Shortest configured horizon — used to pick up reports as early as possible."""
    mapping = get_time_horizon_hours()
    if not mapping:
        return get_settings().accuracy_eval_window_hours
    return min(mapping.values())


def _utc_now() -> datetime:
    return datetime.now(UTC)


async def score_matured_recommendations() -> int:
    """Find and score recommendations that are old enough to evaluate."""
    cutoff = _utc_now() - timedelta(hours=_min_eval_window_hours())
    scored = 0

    async with async_session() as session:
        stmt = (
            select(AnalysisReport)
            .where(AnalysisReport.created_at <= cutoff)
            .order_by(AnalysisReport.created_at.asc())
        )
        reports = (await session.execute(stmt)).scalars().all()

        # Collect all unique (symbol, time) pairs we'll need prices for
        price_requests: set[tuple[str, datetime]] = set()
        for report in reports:
            if _already_scored(report):
                continue
            recs = report.recommendations
            if not isinstance(recs, list) or not recs:
                continue
            for rec in recs:
                action = (rec.get("action") or "").lower()
                if action not in ("buy", "sell"):
                    continue
                symbol = rec.get("symbol") or _infer_symbol_from_scope(report.scope)
                if not symbol:
                    continue
                rec_time_horizon = rec.get("time_horizon")
                window_hours = _get_eval_window_hours(rec_time_horizon)
                price_requests.add((symbol, report.created_at))
                future_time = report.created_at + timedelta(hours=window_hours)
                price_requests.add((symbol, future_time))

        # Bulk prefetch all needed prices
        price_cache = await build_price_cache_from_requests(session, price_requests)

        for report in reports:
            if _already_scored(report):
                continue
            accuracy = await _score_one(session, report, price_cache)
            if accuracy is None:
                continue
            await session.execute(
                sa_update(AnalysisReport)
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
    session: AsyncSession,
    report: AnalysisReport,
    price_cache: dict[tuple[str, datetime], float | None],
) -> dict[str, Any] | None:
    recs = report.recommendations
    if not isinstance(recs, list) or not recs:
        return None

    now = _utc_now()
    details: list[dict] = []
    correct_count = 0
    has_pending = False

    for rec in recs:
        action = (rec.get("action") or "").lower()
        if action not in ("buy", "sell"):
            continue
        symbol = rec.get("symbol") or _infer_symbol_from_scope(report.scope)
        if not symbol:
            continue

        rec_time_horizon = rec.get("time_horizon")
        window_hours = _get_eval_window_hours(rec_time_horizon)
        future_time = report.created_at + timedelta(hours=window_hours)
        if now < future_time:
            has_pending = True
            continue

        price_then = price_cache.get((symbol, report.created_at))
        if price_then is None:
            continue

        price_after = price_cache.get((symbol, future_time))
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
                "price_after": round(price_after, 2),
                "window_hours": window_hours,
                "time_horizon": rec_time_horizon,
                "change_pct": round(change_pct, 2),
                "correct": correct,
                "return_pct": round(change_pct if action == "buy" else -change_pct, 2),
                "target_hit": target_hit,
                "stop_hit": stop_hit,
            }
        )

    if has_pending or not details:
        return None

    accuracy_pct = round(correct_count / len(details) * 100, 1)
    return {
        "scored": True,
        "evaluated_at": now.isoformat(),
        "accuracy_pct": accuracy_pct,
        "details": details,
    }


def _infer_symbol_from_scope(scope: str) -> str | None:
    """Symbol-scoped reports often skip ``rec.symbol``; fall back to the scope."""
    if scope == "market" or not scope:
        return None
    return scope


async def score_matured_news() -> int:
    """Score news analyses once their time_horizon window has elapsed."""
    cutoff = _utc_now() - timedelta(hours=_min_eval_window_hours())
    scored = 0

    async with async_session() as session:
        stmt = (
            select(NewsAnalysis)
            .where(NewsAnalysis.created_at <= cutoff)
            .where(NewsAnalysis.status == "done")
            .where(NewsAnalysis.direction != 0)
            .where(NewsAnalysis.primary_asset.is_not(None))
            .order_by(NewsAnalysis.created_at.asc())
        )
        rows = (await session.execute(stmt)).scalars().all()

        # Collect all price requests
        price_requests: set[tuple[str, datetime]] = set()
        for na in rows:
            if na.accuracy and na.accuracy.get("scored"):
                continue
            symbol = na.primary_asset
            if symbol is None:
                continue
            symbol = normalize_symbol(symbol)
            window_hours = _get_eval_window_hours(na.time_horizon)
            price_requests.add((symbol, na.created_at))
            future_time = na.created_at + timedelta(hours=window_hours)
            price_requests.add((symbol, future_time))

        # Bulk prefetch
        price_cache = await build_price_cache_from_requests(session, price_requests)

        for na in rows:
            if na.accuracy and na.accuracy.get("scored"):
                continue

            symbol = na.primary_asset
            if symbol is None:
                continue
            symbol = normalize_symbol(symbol)
            window_hours = _get_eval_window_hours(na.time_horizon)
            future_time = na.created_at + timedelta(hours=window_hours)
            if _utc_now() < future_time:
                continue

            price_then = price_cache.get((symbol, na.created_at))
            if price_then is None:
                continue

            price_after = price_cache.get((symbol, future_time))
            if price_after is None:
                continue

            change_pct = (price_after - price_then) / price_then * 100
            actual_dir = 1 if change_pct > 0 else (-1 if change_pct < 0 else 0)
            correct = na.direction == actual_dir

            accuracy = {
                "scored": True,
                "evaluated_at": datetime.now(UTC).isoformat(),
                "window_hours": window_hours,
                "time_horizon": na.time_horizon,
                "price_at_analysis": round(price_then, 2),
                "price_after": round(price_after, 2),
                "change_pct": round(change_pct, 2),
                "predicted_direction": na.direction,
                "actual_direction": actual_dir,
                "correct": correct,
            }

            await session.execute(
                sa_update(NewsAnalysis)
                .where(NewsAnalysis.id == na.id)
                .values(accuracy=accuracy)
            )
            scored += 1

        await session.commit()

    if scored > 0:
        await _update_rolling_accuracy()

    logger.info("Scored %s matured news analyses", scored)
    return scored


async def _update_rolling_accuracy() -> dict:
    """Calculate and cache rolling accuracy stats for the last 7 and 30 days."""
    stats: dict[str, dict] = {}

    async with async_session() as session:
        for days_label, days in (("7d", 7), ("30d", 30)):
            cutoff = datetime.now(UTC) - timedelta(days=days)
            # Only fetch reports that have been scored (have accuracy with details)
            stmt = (
                select(AnalysisReport)
                .where(AnalysisReport.created_at >= cutoff)
                .where(AnalysisReport.accuracy.isnot(None))
            )
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

        # News signal accuracy
        for days_label, days in (("7d", 7), ("30d", 30)):
            cutoff = datetime.now(UTC) - timedelta(days=days)
            news_stmt = (
                select(NewsAnalysis)
                .where(NewsAnalysis.created_at >= cutoff)
                .where(NewsAnalysis.direction != 0)
                .where(NewsAnalysis.accuracy.isnot(None))
            )
            news_rows = (await session.execute(news_stmt)).scalars().all()
            news_correct = 0
            news_total = 0
            for na in news_rows:
                acc = na.accuracy or {}
                if not acc.get("scored"):
                    continue
                news_total += 1
                if acc.get("correct"):
                    news_correct += 1
            stats.setdefault("news", {})[days_label] = {
                "accuracy_pct": round(news_correct / news_total * 100, 1)
                if news_total > 0
                else None,
                "total_scored": news_total,
            }

    await cache_set("analysis:accuracy", json.dumps(stats), ttl=3600)
    return stats


async def get_accuracy_stats() -> dict:
    """Return cached rolling accuracy stats, recomputing on cache miss."""
    data = await cache_get("analysis:accuracy")
    if data:
        return json.loads(data)
    return await _update_rolling_accuracy()

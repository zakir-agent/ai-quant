"""Automatic AI recommendation accuracy tracker.

Runs on schedule to evaluate past recommendations that have matured (enough
time has passed to check the outcome). Results land in the dedicated
``analysis_report.accuracy`` JSON column rather than being stuffed back into
``data_sources``.

Scoring is path-aware: the 1h candle high/low sequence between the
recommendation and the window end decides whether stop_loss or target_price
was touched first. Window-end direction calls below the configured minimum
move threshold (fees + slippage) are recorded as "flat" and excluded from
the accuracy denominator.

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
from app.services.price_cache import (
    build_candle_series,
    build_price_cache_from_requests,
    normalize_symbol,
)

logger = logging.getLogger(__name__)

# Grace period after a window ends before declaring missing price data
# permanent and writing a terminal "skipped" accuracy state.
_UNSCORABLE_GRACE_HOURS = 48

# Symbol used for the naive "always buy BTC" baseline comparison.
_BASELINE_SYMBOL = "BTC/USDT"

# Candle tuple layout produced by build_candle_series.
CandleSeries = dict[str, list[tuple[datetime, float, float, float]]]


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


def _skipped_accuracy(reason: str) -> dict[str, Any]:
    """Terminal accuracy state for rows that can never be scored."""
    return {
        "scored": True,
        "skipped": reason,
        "evaluated_at": _utc_now().isoformat(),
    }


async def score_matured_recommendations() -> int:
    """Find and score recommendations that are old enough to evaluate."""
    cutoff = _utc_now() - timedelta(hours=_min_eval_window_hours())
    scored = 0
    skipped = 0

    async with async_session() as session:
        stmt = (
            select(AnalysisReport)
            .where(AnalysisReport.created_at <= cutoff)
            .where(AnalysisReport.accuracy.is_(None))
            .order_by(AnalysisReport.created_at.asc())
        )
        reports = (await session.execute(stmt)).scalars().all()

        # Collect all unique (symbol, time) pairs we'll need prices for, plus
        # the symbol/time bounds for the path-scan candle series.
        price_requests: set[tuple[str, datetime]] = set()
        candle_symbols: set[str] = set()
        candle_start: datetime | None = None
        candle_end: datetime | None = None
        for report in reports:
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
                candle_symbols.add(normalize_symbol(symbol))
                if candle_start is None or report.created_at < candle_start:
                    candle_start = report.created_at
                if candle_end is None or future_time > candle_end:
                    candle_end = future_time

        # Bulk prefetch all needed prices and the candle paths
        price_cache = await build_price_cache_from_requests(session, price_requests)
        candles: CandleSeries = {}
        if candle_symbols and candle_start is not None and candle_end is not None:
            candles = await build_candle_series(
                session, list(candle_symbols), candle_start, candle_end
            )

        for report in reports:
            accuracy = await _score_one(session, report, price_cache, candles)
            if accuracy is None:
                continue
            await session.execute(
                sa_update(AnalysisReport)
                .where(AnalysisReport.id == report.id)
                .values(accuracy=accuracy)
            )
            if accuracy.get("skipped"):
                skipped += 1
            else:
                scored += 1

        await session.commit()

    if scored > 0:
        await _update_rolling_accuracy()

    logger.info("Scored %s matured reports (%s skipped as unscorable)", scored, skipped)
    return scored


def _first_touch(
    action: str,
    target: float | None,
    stop: float | None,
    candles: list[tuple[datetime, float, float, float]],
    start: datetime,
    end: datetime,
) -> tuple[str, float] | None:
    """Walk candles in time order; return ("stop"|"target", exit_price) on touch.

    When both levels are touched within the same candle we cannot know which
    came first, so we conservatively count it as a stop.
    """
    if target is None and stop is None:
        return None
    for ts, high, low, _close in candles:
        if ts < start:
            continue
        if ts > end:
            break
        if action == "buy":
            stop_touch = stop is not None and low <= stop
            target_touch = target is not None and high >= target
        else:
            stop_touch = stop is not None and high >= stop
            target_touch = target is not None and low <= target
        if stop_touch:
            return ("stop", float(stop))  # type: ignore[arg-type]
        if target_touch:
            return ("target", float(target))  # type: ignore[arg-type]
    return None


async def _score_one(
    session: AsyncSession | None,
    report: AnalysisReport,
    price_cache: dict[tuple[str, datetime], float | None],
    candles: CandleSeries | None = None,
) -> dict[str, Any] | None:
    """Score one report.

    Returns:
    - a scored accuracy dict when at least one recommendation was evaluated;
    - a terminal ``skipped`` dict when the report can never be scored;
    - ``None`` when scoring should be retried later (pending windows, or
      missing price data still within the grace period).
    """
    recs = report.recommendations
    if not isinstance(recs, list) or not recs:
        return _skipped_accuracy("no_actionable_recommendations")

    now = _utc_now()
    min_move_pct = get_settings().accuracy_min_move_pct
    details: list[dict] = []
    correct_count = 0
    decided_count = 0
    has_pending = False
    had_actionable = False
    missing_recoverable = False

    for rec in recs:
        action = (rec.get("action") or "").lower()
        if action not in ("buy", "sell"):
            continue
        had_actionable = True
        symbol = rec.get("symbol") or _infer_symbol_from_scope(report.scope)
        if not symbol:
            continue

        rec_time_horizon = rec.get("time_horizon")
        window_hours = _get_eval_window_hours(rec_time_horizon)
        future_time = report.created_at + timedelta(hours=window_hours)
        if now < future_time:
            has_pending = True
            continue
        grace_deadline = future_time + timedelta(hours=_UNSCORABLE_GRACE_HOURS)

        price_then = price_cache.get((symbol, report.created_at))
        if price_then is None:
            if now <= grace_deadline:
                missing_recoverable = True
            continue

        target = rec.get("target_price")
        stop = rec.get("stop_loss")
        sym_candles = (candles or {}).get(normalize_symbol(symbol)) or []

        exit_reason = "window_end"
        exit_price: float | None = None
        if sym_candles:
            hit = _first_touch(
                action, target, stop, sym_candles, report.created_at, future_time
            )
            if hit is not None:
                exit_reason, exit_price = hit

        is_flat = False
        if exit_reason == "window_end":
            price_after = price_cache.get((symbol, future_time))
            if price_after is None:
                if now <= grace_deadline:
                    missing_recoverable = True
                continue
            change_pct = (price_after - price_then) / price_then * 100
            if abs(change_pct) < min_move_pct:
                is_flat = True
                correct = False
            else:
                correct = (action == "buy" and change_pct > 0) or (
                    action == "sell" and change_pct < 0
                )
            if sym_candles:
                # Path was scanned and neither level was touched.
                target_hit = False
                stop_hit = False
            else:
                # No candle data — legacy window-end level checks.
                target_hit = target is not None and (
                    (action == "buy" and price_after >= target)
                    or (action == "sell" and price_after <= target)
                )
                stop_hit = stop is not None and (
                    (action == "buy" and price_after <= stop)
                    or (action == "sell" and price_after >= stop)
                )
        else:
            price_after = exit_price
            change_pct = (price_after - price_then) / price_then * 100
            correct = exit_reason == "target"
            target_hit = exit_reason == "target"
            stop_hit = exit_reason == "stop"

        if not is_flat:
            decided_count += 1
            if correct:
                correct_count += 1

        confidence = rec.get("confidence")
        detail: dict[str, Any] = {
            "symbol": symbol,
            "action": action,
            "confidence": confidence.lower() if isinstance(confidence, str) else None,
            "price_at_rec": round(price_then, 2),
            "price_after": round(price_after, 2),
            "window_hours": window_hours,
            "time_horizon": rec_time_horizon,
            "change_pct": round(change_pct, 2),
            "correct": None if is_flat else correct,
            "return_pct": round(change_pct if action == "buy" else -change_pct, 2),
            "target_hit": target_hit,
            "stop_hit": stop_hit,
            "exit_reason": exit_reason,
        }
        if is_flat:
            detail["flat"] = True
        details.append(detail)

    if has_pending:
        return None

    if details:
        accuracy_pct = (
            round(correct_count / decided_count * 100, 1) if decided_count else None
        )
        return {
            "scored": True,
            "evaluated_at": now.isoformat(),
            "accuracy_pct": accuracy_pct,
            "details": details,
        }

    if missing_recoverable:
        return None
    if had_actionable:
        return _skipped_accuracy("missing_price_data")
    return _skipped_accuracy("no_actionable_recommendations")


def _infer_symbol_from_scope(scope: str) -> str | None:
    """Symbol-scoped reports often skip ``rec.symbol``; fall back to the scope."""
    if scope == "market" or not scope:
        return None
    return scope


async def score_matured_news() -> int:
    """Score news analyses once their time_horizon window has elapsed."""
    cutoff = _utc_now() - timedelta(hours=_min_eval_window_hours())
    scored = 0
    skipped = 0

    async with async_session() as session:
        stmt = (
            select(NewsAnalysis)
            .where(NewsAnalysis.created_at <= cutoff)
            .where(NewsAnalysis.status == "done")
            .where(NewsAnalysis.direction != 0)
            .where(NewsAnalysis.primary_asset.is_not(None))
            .where(NewsAnalysis.accuracy.is_(None))
            .order_by(NewsAnalysis.created_at.asc())
        )
        rows = (await session.execute(stmt)).scalars().all()

        # Collect all price requests
        price_requests: set[tuple[str, datetime]] = set()
        for na in rows:
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
            symbol = na.primary_asset
            if symbol is None:
                continue
            symbol = normalize_symbol(symbol)
            window_hours = _get_eval_window_hours(na.time_horizon)
            future_time = na.created_at + timedelta(hours=window_hours)
            if _utc_now() < future_time:
                continue

            price_then = price_cache.get((symbol, na.created_at))
            price_after = price_cache.get((symbol, future_time))
            if price_then is None or price_after is None:
                # Price data missing — terminal skip once the grace period
                # after window end has passed (e.g. primary_asset never maps
                # to a collected symbol), otherwise retry next round.
                grace = future_time + timedelta(hours=_UNSCORABLE_GRACE_HOURS)
                if _utc_now() > grace:
                    await session.execute(
                        sa_update(NewsAnalysis)
                        .where(NewsAnalysis.id == na.id)
                        .values(accuracy=_skipped_accuracy("missing_price_data"))
                    )
                    skipped += 1
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

    logger.info(
        "Scored %s matured news analyses (%s skipped as unscorable)", scored, skipped
    )
    return scored


def _summarize_rec_details(details: list[dict]) -> dict[str, Any]:
    """Aggregate scored detail rows into totals plus per-confidence buckets.

    Flat entries count toward totals and average return, but are excluded
    from every accuracy denominator.
    """
    total = len(details)
    flat_count = 0
    correct = 0
    total_return = 0.0
    buckets: dict[str, dict[str, float]] = {
        c: {"correct": 0, "decided": 0, "count": 0, "return_sum": 0.0}
        for c in ("high", "medium", "low")
    }

    for d in details:
        is_flat = bool(d.get("flat"))
        if is_flat:
            flat_count += 1
        elif d.get("correct"):
            correct += 1
        total_return += d.get("return_pct", 0) or 0

        conf = (d.get("confidence") or "").lower()
        bucket = buckets.get(conf)
        if bucket is None:
            continue
        bucket["count"] += 1
        bucket["return_sum"] += d.get("return_pct", 0) or 0
        if not is_flat:
            bucket["decided"] += 1
            if d.get("correct"):
                bucket["correct"] += 1

    decided = total - flat_count
    by_confidence = {
        c: {
            "accuracy_pct": round(b["correct"] / b["decided"] * 100, 1)
            if b["decided"]
            else None,
            "avg_return_pct": round(b["return_sum"] / b["count"], 2)
            if b["count"]
            else None,
            "count": int(b["count"]),
        }
        for c, b in buckets.items()
    }
    return {
        "total": total,
        "flat_count": flat_count,
        "accuracy_pct": round(correct / decided * 100, 1) if decided else None,
        "avg_return_pct": round(total_return / total, 2) if total else None,
        "by_confidence": by_confidence,
    }


def _compute_baseline(
    windows: list[tuple[datetime, int]],
    btc_prices: dict[tuple[str, datetime], float | None],
    min_move_pct: float,
) -> float | None:
    """Directional hit rate of naive "always buy BTC" over the same windows."""
    correct = 0
    decided = 0
    for start, window_hours in windows:
        p0 = btc_prices.get((_BASELINE_SYMBOL, start))
        p1 = btc_prices.get((_BASELINE_SYMBOL, start + timedelta(hours=window_hours)))
        if not p0 or p1 is None:
            continue
        change_pct = (p1 - p0) / p0 * 100
        if abs(change_pct) < min_move_pct:
            continue
        decided += 1
        if change_pct > 0:
            correct += 1
    return round(correct / decided * 100, 1) if decided else None


async def _update_rolling_accuracy() -> dict:
    """Calculate and cache rolling accuracy stats for the last 7 and 30 days."""
    stats: dict[str, dict] = {}
    min_move_pct = get_settings().accuracy_min_move_pct

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

            all_details: list[dict] = []
            windows: list[tuple[datetime, int]] = []
            scored_reports = 0

            for r in reports:
                acc = r.accuracy or {}
                if acc.get("skipped"):
                    continue
                details = acc.get("details") or []
                if not details:
                    continue
                scored_reports += 1
                for d in details:
                    all_details.append(d)
                    window_hours = d.get("window_hours")
                    if isinstance(window_hours, int | float):
                        windows.append((r.created_at, int(window_hours)))

            summary = _summarize_rec_details(all_details)

            btc_requests: set[tuple[str, datetime]] = set()
            for start, window_hours in windows:
                btc_requests.add((_BASELINE_SYMBOL, start))
                btc_requests.add(
                    (_BASELINE_SYMBOL, start + timedelta(hours=window_hours))
                )
            btc_prices = await build_price_cache_from_requests(session, btc_requests)
            baseline = _compute_baseline(windows, btc_prices, min_move_pct)

            accuracy_pct = summary["accuracy_pct"]
            stats[days_label] = {
                "accuracy_pct": accuracy_pct,
                "avg_return_pct": summary["avg_return_pct"],
                "total_recommendations": summary["total"],
                "scored_reports": scored_reports,
                "flat_count": summary["flat_count"],
                "baseline_accuracy_pct": baseline,
                "excess_accuracy_pct": round(accuracy_pct - baseline, 1)
                if accuracy_pct is not None and baseline is not None
                else None,
                "by_confidence": summary["by_confidence"],
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
                if not acc.get("scored") or acc.get("skipped"):
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

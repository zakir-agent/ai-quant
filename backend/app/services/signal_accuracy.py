"""Composite signal accuracy evaluation.

Scores persisted ``composite_signal`` rows once their evaluation window
(``SIGNAL_EVAL_WINDOW_HOURS``, default 24h) has elapsed: a buy/strong_buy
signal is correct when the price rose over the window, sell/strong_sell when
it fell. Neutral signals are never evaluated. Results land in the row's
``accuracy`` JSON column; rolling 7d/30d stats (bucketed by signal strength)
are cached for the API.

Intentionally separate from ``accuracy_tracker`` (AI recommendation scoring)
so composite vs pure-AI accuracy can be compared side by side.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy import update as sa_update

from app.config import get_settings
from app.database import async_session
from app.models.composite_signal import CompositeSignal
from app.services.cache import cache_get, cache_set
from app.services.price_cache import build_price_cache_from_requests

logger = logging.getLogger(__name__)

_ACCURACY_CACHE_KEY = "signals:accuracy"
_ACCURACY_CACHE_TTL = 3600
# After the window ends, wait this long for price data to backfill before
# giving up and writing a terminal "skipped" accuracy record.
_NO_PRICE_GRACE_HOURS = 48

_BULLISH = ("buy", "strong_buy")
_BEARISH = ("sell", "strong_sell")
_SIGNAL_BUCKETS = ("strong_buy", "buy", "sell", "strong_sell")


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _score_signal(
    row: Any,
    price_cache: dict[tuple[str, datetime], float | None],
    now: datetime,
    window_hours: int,
) -> dict[str, Any] | None:
    """Return the accuracy JSON for one signal row, or None to retry later."""
    if row.signal not in _BULLISH and row.signal not in _BEARISH:
        return None  # neutral or unknown — never scored

    eval_time = row.created_at + timedelta(hours=window_hours)
    if now < eval_time:
        return None  # window not elapsed yet

    price_at_signal = price_cache.get((row.symbol, row.created_at))
    price_after = price_cache.get((row.symbol, eval_time))
    if price_at_signal is None or price_after is None:
        if now >= eval_time + timedelta(hours=_NO_PRICE_GRACE_HOURS):
            return {"scored": True, "skipped": "no_price_data"}
        return None  # price data may still backfill — retry next run

    change_pct = (price_after - price_at_signal) / price_at_signal * 100
    correct = change_pct > 0 if row.signal in _BULLISH else change_pct < 0

    return {
        "scored": True,
        "evaluated_at": now.isoformat(),
        "price_at_signal": round(price_at_signal, 2),
        "price_after": round(price_after, 2),
        "change_pct": round(change_pct, 2),
        "correct": correct,
    }


async def evaluate_pending_signals() -> int:
    """Find matured unscored composite signals and write their accuracy."""
    window_hours = get_settings().signal_eval_window_hours
    now = _utc_now()
    cutoff = now - timedelta(hours=window_hours)
    scored = 0

    async with async_session() as session:
        stmt = (
            select(CompositeSignal)
            .where(CompositeSignal.created_at <= cutoff)
            .where(CompositeSignal.accuracy.is_(None))
            .where(CompositeSignal.signal != "neutral")
            .order_by(CompositeSignal.created_at.asc())
        )
        rows = (await session.execute(stmt)).scalars().all()
        if not rows:
            return 0

        price_requests: set[tuple[str, datetime]] = set()
        for row in rows:
            price_requests.add((row.symbol, row.created_at))
            price_requests.add(
                (row.symbol, row.created_at + timedelta(hours=window_hours))
            )

        price_cache = await build_price_cache_from_requests(session, price_requests)

        for row in rows:
            accuracy = _score_signal(row, price_cache, now, window_hours)
            if accuracy is None:
                continue
            await session.execute(
                sa_update(CompositeSignal)
                .where(CompositeSignal.id == row.id)
                .values(accuracy=accuracy)
            )
            scored += 1

        await session.commit()

    if scored > 0:
        await _update_signal_accuracy_stats()

    logger.info("Scored %s matured composite signals", scored)
    return scored


def _compute_bucket_stats(rows: list[tuple[str, dict]]) -> dict[str, Any]:
    """Aggregate (signal, accuracy) pairs into per-bucket and overall stats.

    Skipped rows (no_price_data) are excluded from accuracy math.
    """
    buckets = {sig: {"correct": 0, "count": 0} for sig in _SIGNAL_BUCKETS}
    total = 0
    total_correct = 0

    for signal, acc in rows:
        if not acc or not acc.get("scored") or "correct" not in acc:
            continue
        if signal not in buckets:
            continue
        buckets[signal]["count"] += 1
        total += 1
        if acc["correct"]:
            buckets[signal]["correct"] += 1
            total_correct += 1

    return {
        "accuracy_pct": round(total_correct / total * 100, 1) if total else None,
        "total_scored": total,
        "by_signal": {
            sig: {
                "accuracy_pct": round(v["correct"] / v["count"] * 100, 1)
                if v["count"]
                else None,
                "count": v["count"],
            }
            for sig, v in buckets.items()
        },
    }


async def _update_signal_accuracy_stats() -> dict:
    """Recompute and cache rolling 7d/30d composite signal accuracy stats."""
    stats: dict[str, Any] = {}

    async with async_session() as session:
        for label, days in (("7d", 7), ("30d", 30)):
            cutoff = _utc_now() - timedelta(days=days)
            stmt = (
                select(CompositeSignal.signal, CompositeSignal.accuracy)
                .where(CompositeSignal.created_at >= cutoff)
                .where(CompositeSignal.accuracy.isnot(None))
            )
            rows = (await session.execute(stmt)).all()
            stats[label] = _compute_bucket_stats([(sig, acc) for sig, acc in rows])

    await cache_set(_ACCURACY_CACHE_KEY, json.dumps(stats), ttl=_ACCURACY_CACHE_TTL)
    return stats


async def get_signal_accuracy_stats() -> dict:
    """Return cached rolling signal accuracy stats, recomputing on cache miss."""
    data = await cache_get(_ACCURACY_CACHE_KEY)
    if data:
        return json.loads(data)
    return await _update_signal_accuracy_stats()

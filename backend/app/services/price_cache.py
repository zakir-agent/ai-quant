"""Shared price cache for bulk-fetching OHLCV data and serving in-memory lookups.

Used by backtester and accuracy tracker to avoid repeated DB queries.
"""

from __future__ import annotations

import logging
from bisect import bisect_left
from datetime import datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import OHLCVData

logger = logging.getLogger(__name__)

_PRICE_TOLERANCE_SECONDS = 7200  # ±2h


def normalize_symbol(symbol: str) -> str:
    if "/" not in symbol:
        return f"{symbol}/USDT"
    return symbol


class PriceCache:
    """Bulk-fetch OHLCV data once, then serve in-memory lookups via binary search."""

    def __init__(self, data: dict[str, list[tuple[datetime, float]]]):
        self._data = data
        self._indexes: dict[str, list[datetime]] = {}
        for sym, rows in self._data.items():
            self._indexes[sym] = [r[0] for r in rows]

    def get_price(self, symbol: str, target_time: datetime) -> float | None:
        """Get closest close price to target_time within ±2h."""
        symbol = normalize_symbol(symbol)
        timestamps = self._indexes.get(symbol)
        rows = self._data.get(symbol)
        if not timestamps or not rows:
            return None

        idx = bisect_left(timestamps, target_time)
        best = None
        best_dist = float("inf")
        for i in (idx - 1, idx, idx + 1):
            if 0 <= i < len(rows):
                dist = abs((rows[i][0] - target_time).total_seconds())
                if dist < best_dist and dist <= _PRICE_TOLERANCE_SECONDS:
                    best_dist = dist
                    best = rows[i][1]
        return best

    def get_latest_price(self, symbol: str) -> float | None:
        """Get the most recent price for a symbol."""
        symbol = normalize_symbol(symbol)
        rows = self._data.get(symbol)
        if not rows:
            return None
        return rows[-1][1]

    def as_dict(self) -> dict[tuple[str, datetime], float | None]:
        """Return a flat dict view of all cached data for dict-based lookups."""
        result: dict[tuple[str, datetime], float | None] = {}
        for symbol, rows in self._data.items():
            for ts, close in rows:
                result[(symbol, ts)] = close
        return result


async def build_price_cache_from_requests(
    session: AsyncSession, requests: set[tuple[str, datetime]]
) -> dict[tuple[str, datetime], float | None]:
    """Bulk-fetch OHLCV data for specific (symbol, time) pairs.

    Returns a dict for O(1) lookup by exact (symbol, time) key.
    Used by accuracy_tracker where lookup times are pre-determined.
    """
    if not requests:
        return {}

    symbols = list({s for s, _ in requests})
    times = [t for _, t in requests]
    min_time = min(times) - timedelta(hours=2)
    max_time = max(times) + timedelta(hours=2)

    stmt = (
        select(OHLCVData.symbol, OHLCVData.timestamp, OHLCVData.close)
        .where(
            and_(
                OHLCVData.symbol.in_(symbols),
                OHLCVData.timeframe == "1h",
                OHLCVData.timestamp >= min_time,
                OHLCVData.timestamp <= max_time,
            )
        )
        .order_by(OHLCVData.symbol, OHLCVData.timestamp)
    )
    rows = (await session.execute(stmt)).all()

    by_symbol: dict[str, list[tuple[datetime, float]]] = {}
    for symbol, ts, close in rows:
        by_symbol.setdefault(symbol, []).append((ts, float(close)))

    result: dict[tuple[str, datetime], float | None] = {}
    for symbol, target_time in requests:
        candle_rows = by_symbol.get(symbol, [])
        if not candle_rows:
            result[(symbol, target_time)] = None
            continue
        best = None
        best_dist = float("inf")
        for ts, close in candle_rows:
            dist = abs((ts - target_time).total_seconds())
            if dist < best_dist and dist <= _PRICE_TOLERANCE_SECONDS:
                best_dist = dist
                best = close
        result[(symbol, target_time)] = best
    return result


async def build_price_cache(
    session: AsyncSession, symbols: list[str], start_time: datetime, end_time: datetime
) -> PriceCache:
    """Bulk-fetch all 1h OHLCV data for given symbols and time range.

    Returns a PriceCache for efficient binary-search lookups.
    Used by backtester where lookup times span a continuous range.
    """
    stmt = (
        select(OHLCVData.symbol, OHLCVData.timestamp, OHLCVData.close)
        .where(
            and_(
                OHLCVData.symbol.in_(symbols),
                OHLCVData.timeframe == "1h",
                OHLCVData.timestamp >= start_time - timedelta(hours=2),
                OHLCVData.timestamp <= end_time + timedelta(hours=2),
            )
        )
        .order_by(OHLCVData.symbol, OHLCVData.timestamp)
    )
    result = await session.execute(stmt)
    rows = result.all()

    data: dict[str, list[tuple[datetime, float]]] = {}
    for symbol, ts, close in rows:
        data.setdefault(symbol, []).append((ts, float(close)))

    return PriceCache(data)

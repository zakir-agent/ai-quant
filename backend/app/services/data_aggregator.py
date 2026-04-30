"""Aggregate latest data from all sources into snapshots used by AI analysis.

Public API:
    - ``get_latest_snapshot()``  → market-wide snapshot
    - ``get_symbol_snapshot(symbol)`` → single-symbol deep snapshot

HTTP-backed helpers (market overview, fear & greed) are run concurrently
via ``asyncio.gather()``.  DB-backed helpers share a single session and
are run sequentially to avoid SQLAlchemy ``concurrent operations`` errors.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.market import DefiMetric, DexVolume, FuturesMetric, OHLCVData
from app.models.news import NewsArticle
from app.models.news_analysis import NewsAnalysis
from app.services.cache import cache_get
from app.services.technical_indicators import compute_indicators

logger = logging.getLogger(__name__)

# Pairs included in the market-wide snapshot. Kept narrow on purpose — the
# point of the market-wide run is *overview*, not exhaustive coverage.
KEY_PAIRS: tuple[str, ...] = ("BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT")

# Multi-timeframe window for symbol deep dives.
SYMBOL_TIMEFRAMES: tuple[tuple[str, int], ...] = (("1h", 48), ("4h", 30), ("1d", 30))


# ---------------------------------------------------------------------------
# Cache-backed sources (no DB session needed)
# ---------------------------------------------------------------------------


async def _market_overview_top(limit: int = 10) -> list[dict]:
    raw = await cache_get("market:overview")
    if not raw:
        return []
    try:
        coins = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("market:overview cache is not valid JSON")
        return []
    return [
        {
            "symbol": c["symbol"],
            "price": c["current_price"],
            "change_24h": c.get("price_change_24h"),
            "change_7d": c.get("price_change_7d"),
            "market_cap": c.get("market_cap"),
        }
        for c in coins[:limit]
    ]


async def _market_overview_for(base: str) -> dict | None:
    raw = await cache_get("market:overview")
    if not raw:
        return None
    try:
        coins = json.loads(raw)
    except json.JSONDecodeError:
        return None
    for c in coins:
        if c.get("symbol", "").upper() == base.upper():
            return {
                "symbol": c["symbol"],
                "price": c["current_price"],
                "change_24h": c.get("price_change_24h"),
                "change_7d": c.get("price_change_7d"),
                "market_cap": c.get("market_cap"),
                "volume_24h": c.get("total_volume"),
            }
    return None


async def _fear_greed() -> dict | None:
    raw = await cache_get("market:fear_greed")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


# ---------------------------------------------------------------------------
# DB-backed sources (caller passes a session for connection reuse)
# ---------------------------------------------------------------------------


async def _price_summary(session: AsyncSession, symbol: str) -> dict | None:
    stmt = (
        select(OHLCVData)
        .where(OHLCVData.symbol == symbol, OHLCVData.timeframe == "1h")
        .order_by(OHLCVData.timestamp.desc())
        .limit(24)
    )
    rows = (await session.execute(stmt)).scalars().all()
    if not rows:
        return None
    latest = rows[0]
    return {
        "symbol": symbol,
        "current": float(latest.close),
        "high_24h": max(float(r.high) for r in rows),
        "low_24h": min(float(r.low) for r in rows),
        "volume_latest": float(latest.volume),
    }


async def _futures_metric(session: AsyncSession, symbol: str) -> dict | None:
    stmt = (
        select(FuturesMetric)
        .where(FuturesMetric.symbol == symbol)
        .order_by(FuturesMetric.timestamp.desc())
        .limit(1)
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        return None
    return {
        "symbol": symbol,
        "funding_rate": float(row.funding_rate)
        if row.funding_rate is not None
        else None,
        "open_interest": float(row.open_interest)
        if row.open_interest is not None
        else None,
        "long_short_ratio": float(row.long_short_ratio)
        if row.long_short_ratio is not None
        else None,
        "long_pct": float(row.long_account_pct)
        if row.long_account_pct is not None
        else None,
        "short_pct": float(row.short_account_pct)
        if row.short_account_pct is not None
        else None,
    }


async def _dex_top_pairs(session: AsyncSession, limit: int = 10) -> list[dict]:
    latest_ts = select(func.max(DexVolume.timestamp)).scalar_subquery()
    stmt = (
        select(DexVolume)
        .where(DexVolume.timestamp == latest_ts)
        .order_by(DexVolume.volume_24h.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "pair": r.pair,
            "chain": r.chain,
            "dex": r.dex,
            "volume_24h": float(r.volume_24h),
            "liquidity": float(r.liquidity_usd),
        }
        for r in rows
    ]


async def _dex_pairs_for(
    session: AsyncSession, base: str, limit: int = 10
) -> list[dict]:
    stmt = (
        select(DexVolume)
        .where(DexVolume.pair.ilike(f"%{base}%"))
        .order_by(DexVolume.volume_24h.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "pair": r.pair,
            "chain": r.chain,
            "dex": r.dex,
            "volume_24h": float(r.volume_24h),
            "liquidity": float(r.liquidity_usd),
        }
        for r in rows
    ]


async def _defi_top_protocols(session: AsyncSession, limit: int = 10) -> list[dict]:
    latest_ts = select(func.max(DefiMetric.timestamp)).scalar_subquery()
    stmt = (
        select(DefiMetric)
        .where(DefiMetric.timestamp == latest_ts)
        .order_by(DefiMetric.tvl.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [
        {
            "protocol": r.protocol,
            "tvl": float(r.tvl),
            "change_24h": float(r.tvl_change_24h) if r.tvl_change_24h else None,
            "category": r.category,
        }
        for r in rows
    ]


async def _recent_news(session: AsyncSession, limit: int = 10) -> list[dict]:
    stmt = select(NewsArticle).order_by(NewsArticle.published_at.desc()).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()
    return [_news_to_dict(r) for r in rows]


async def _news_for(session: AsyncSession, base: str, limit: int = 10) -> list[dict]:
    stmt = (
        select(NewsArticle)
        .where(NewsArticle.title.ilike(f"%{base}%"))
        .order_by(NewsArticle.published_at.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [_news_to_dict(r) for r in rows]


async def _news_signal(session: AsyncSession, hours: int = 24) -> list[dict]:
    """Return per-asset confidence-weighted news signal for the last N hours."""
    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    weighted = NewsAnalysis.direction * NewsAnalysis.magnitude * NewsAnalysis.confidence
    stmt = (
        select(
            NewsAnalysis.primary_asset.label("asset"),
            func.count(NewsAnalysis.id).label("count"),
            func.sum(weighted).label("weighted"),
            func.avg(NewsAnalysis.intensity).label("intensity"),
        )
        .where(NewsAnalysis.created_at >= cutoff)
        .where(NewsAnalysis.status == "done")
        .where(NewsAnalysis.is_actionable.is_(True))
        .where(NewsAnalysis.primary_asset.is_not(None))
        .group_by(NewsAnalysis.primary_asset)
        .order_by(func.sum(weighted).desc())
        .limit(15)
    )
    rows = (await session.execute(stmt)).all()
    return [
        {
            "asset": r.asset,
            "news_count": int(cast(Any, r.count)),
            "weighted_signal": round(float(r.weighted or 0), 2),
            "avg_intensity": round(float(r.intensity or 0), 1),
        }
        for r in rows
    ]


async def _news_signal_for(
    session: AsyncSession, base: str, hours: int = 24
) -> list[dict]:
    """Return news signal filtered by primary_asset."""
    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    weighted = NewsAnalysis.direction * NewsAnalysis.magnitude * NewsAnalysis.confidence
    stmt = (
        select(
            NewsAnalysis.primary_asset.label("asset"),
            func.count(NewsAnalysis.id).label("count"),
            func.sum(weighted).label("weighted"),
            func.avg(NewsAnalysis.intensity).label("intensity"),
        )
        .where(NewsAnalysis.created_at >= cutoff)
        .where(NewsAnalysis.status == "done")
        .where(NewsAnalysis.is_actionable.is_(True))
        .where(NewsAnalysis.primary_asset == base.upper())
        .group_by(NewsAnalysis.primary_asset)
    )
    rows = (await session.execute(stmt)).all()
    return [
        {
            "asset": r.asset,
            "news_count": int(cast(Any, r.count)),
            "weighted_signal": round(float(r.weighted or 0), 2),
            "avg_intensity": round(float(r.intensity or 0), 1),
        }
        for r in rows
    ]


def _news_to_dict(article: NewsArticle) -> dict:
    return {
        "title": article.title,
        "source": article.source,
        "sentiment": article.sentiment,
        "published_at": article.published_at.isoformat()
        if article.published_at
        else None,
    }


async def _ohlcv_window(
    session: AsyncSession, symbol: str, timeframe: str, limit: int
) -> dict | None:
    """Return summary stats + technical indicators for a price window."""
    stmt = (
        select(OHLCVData)
        .where(OHLCVData.symbol == symbol, OHLCVData.timeframe == timeframe)
        .order_by(OHLCVData.timestamp.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    if not rows:
        return None

    rows_asc = list(reversed(rows))
    closes = [float(r.close) for r in rows_asc]
    highs = [float(r.high) for r in rows_asc]
    lows = [float(r.low) for r in rows_asc]
    volumes = [float(r.volume) for r in rows_asc]
    latest = rows[0]
    open_first = float(rows_asc[0].open)
    change_pct = (
        round((float(latest.close) - open_first) / open_first * 100, 2)
        if open_first
        else 0.0
    )

    summary: dict[str, Any] = {
        "timeframe": timeframe,
        "candles": len(rows),
        "latest_close": float(latest.close),
        "latest_time": latest.timestamp.isoformat(),
        "high": max(highs),
        "low": min(lows),
        "open_first": open_first,
        "close_last": float(latest.close),
        "change_pct": change_pct,
        "avg_volume": round(sum(volumes) / len(volumes), 2),
        "max_volume": max(volumes),
    }
    indicators = compute_indicators(closes, highs, lows, volumes)
    if indicators:
        summary["indicators"] = indicators
    return summary


# ---------------------------------------------------------------------------
# Public snapshot builders
# ---------------------------------------------------------------------------


async def get_latest_snapshot() -> dict:
    """Collect a market-wide snapshot for the AI analysis engine."""

    # HTTP-backed calls (no DB session) can run concurrently.
    market_overview, fear_greed = await asyncio.gather(
        _market_overview_top(),
        _fear_greed(),
    )

    # DB queries share one session — run sequentially to avoid concurrent-op errors.
    async with async_session() as session:
        dex_top = await _dex_top_pairs(session)
        defi_top = await _defi_top_protocols(session)
        news = await _recent_news(session)
        news_signal = await _news_signal(session)
        price_results = [await _price_summary(session, sym) for sym in KEY_PAIRS]
        futures_results = [await _futures_metric(session, sym) for sym in KEY_PAIRS]

    return {
        "timestamp": datetime.now(UTC).isoformat(),
        "market_overview": market_overview,
        "price_summary": [p for p in price_results if p],
        "futures_data": [f for f in futures_results if f],
        "fear_greed": fear_greed,
        "dex_top_pairs": dex_top,
        "defi_top_protocols": defi_top,
        "recent_news": news,
        "news_signal": news_signal,
    }


async def get_symbol_snapshot(symbol: str) -> dict:
    """Collect an in-depth snapshot for a single trading pair (e.g. ``BTC/USDT``)."""
    base = symbol.split("/")[0].upper()

    # HTTP-backed calls (no DB session) can run concurrently.
    market_overview, fear_greed = await asyncio.gather(
        _market_overview_for(base),
        _fear_greed(),
    )

    # DB queries share one session — run sequentially to avoid concurrent-op errors.
    async with async_session() as session:
        futures = await _futures_metric(session, symbol)
        dex_pairs = await _dex_pairs_for(session, base)
        news = await _news_for(session, base)
        news_signal = await _news_signal_for(session, base)
        price_windows = [
            await _ohlcv_window(session, symbol, tf, limit)
            for tf, limit in SYMBOL_TIMEFRAMES
        ]

    snapshot: dict[str, Any] = {
        "timestamp": datetime.now(UTC).isoformat(),
        "symbol": symbol,
        "market_overview": market_overview,
        "futures_data": futures,
        "fear_greed": fear_greed,
        "dex_pairs": dex_pairs,
        "recent_news": news,
        "news_signal": news_signal,
    }
    for (tf, _limit), window in zip(SYMBOL_TIMEFRAMES, price_windows, strict=True):
        snapshot[f"price_{tf}"] = window
    return snapshot

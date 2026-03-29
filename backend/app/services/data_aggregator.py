"""Aggregate latest data from all sources for AI analysis."""

import json
import logging
from datetime import UTC, datetime

from sqlalchemy import func, select

from app.database import async_session
from app.models.market import DefiMetric, DexVolume, OHLCVData
from app.models.news import NewsArticle
from app.services.cache import cache_get
from app.services.technical_indicators import compute_indicators

logger = logging.getLogger(__name__)


async def get_latest_snapshot() -> dict:
    """Collect the latest data from all sources into a single snapshot."""
    snapshot = {
        "timestamp": datetime.now(UTC).isoformat(),
        "market_overview": [],
        "price_summary": [],
        "dex_top_pairs": [],
        "defi_top_protocols": [],
        "recent_news": [],
    }

    # 1. Market overview from cache
    try:
        data = await cache_get("market:overview")
        if data:
            coins = json.loads(data)
            snapshot["market_overview"] = [
                {
                    "symbol": c["symbol"],
                    "price": c["current_price"],
                    "change_24h": c.get("price_change_24h"),
                    "change_7d": c.get("price_change_7d"),
                    "market_cap": c.get("market_cap"),
                }
                for c in coins[:10]
            ]
    except Exception:
        logger.warning("Failed to get market overview from cache", exc_info=True)

    async with async_session() as session:
        # 2. Latest price for key pairs
        key_pairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"]
        for symbol in key_pairs:
            stmt = (
                select(OHLCVData)
                .where(OHLCVData.symbol == symbol, OHLCVData.timeframe == "1h")
                .order_by(OHLCVData.timestamp.desc())
                .limit(24)
            )
            result = await session.execute(stmt)
            rows = result.scalars().all()
            if rows:
                latest = rows[0]
                high_24h = max(float(r.high) for r in rows)
                low_24h = min(float(r.low) for r in rows)
                snapshot["price_summary"].append(
                    {
                        "symbol": symbol,
                        "current": float(latest.close),
                        "high_24h": high_24h,
                        "low_24h": low_24h,
                        "volume_latest": float(latest.volume),
                    }
                )

        # 3. Top DEX pairs
        latest_dex_ts = select(func.max(DexVolume.timestamp)).scalar_subquery()
        stmt = (
            select(DexVolume)
            .where(DexVolume.timestamp == latest_dex_ts)
            .order_by(DexVolume.volume_24h.desc())
            .limit(10)
        )
        result = await session.execute(stmt)
        for r in result.scalars().all():
            snapshot["dex_top_pairs"].append(
                {
                    "pair": r.pair,
                    "chain": r.chain,
                    "dex": r.dex,
                    "volume_24h": float(r.volume_24h),
                    "liquidity": float(r.liquidity_usd),
                }
            )

        # 4. Top DeFi protocols
        latest_defi_ts = select(func.max(DefiMetric.timestamp)).scalar_subquery()
        stmt = (
            select(DefiMetric)
            .where(DefiMetric.timestamp == latest_defi_ts)
            .order_by(DefiMetric.tvl.desc())
            .limit(10)
        )
        result = await session.execute(stmt)
        for r in result.scalars().all():
            snapshot["defi_top_protocols"].append(
                {
                    "protocol": r.protocol,
                    "tvl": float(r.tvl),
                    "change_24h": float(r.tvl_change_24h) if r.tvl_change_24h else None,
                    "category": r.category,
                }
            )

        # 5. Recent news (P4 — empty for now)
        stmt = select(NewsArticle).order_by(NewsArticle.published_at.desc()).limit(10)
        result = await session.execute(stmt)
        for r in result.scalars().all():
            snapshot["recent_news"].append(
                {
                    "title": r.title,
                    "source": r.source,
                    "sentiment": r.sentiment,
                    "published_at": r.published_at.isoformat()
                    if r.published_at
                    else None,
                }
            )

    return snapshot


async def get_symbol_snapshot(symbol: str) -> dict:
    """Collect in-depth data for a single trading pair (e.g. BTC/USDT).

    Includes multi-timeframe OHLCV, DEX pairs, related news, and market overview.
    """
    base = symbol.split("/")[0].upper()  # "BTC/USDT" -> "BTC"

    snapshot = {
        "timestamp": datetime.now(UTC).isoformat(),
        "symbol": symbol,
        "market_overview": None,
        "price_1h": [],
        "price_4h": [],
        "price_1d": [],
        "dex_pairs": [],
        "recent_news": [],
    }

    # 1. Market overview for this coin from cache
    try:
        data = await cache_get("market:overview")
        if data:
            coins = json.loads(data)
            for c in coins:
                if c["symbol"].upper() == base:
                    snapshot["market_overview"] = {
                        "symbol": c["symbol"],
                        "price": c["current_price"],
                        "change_24h": c.get("price_change_24h"),
                        "change_7d": c.get("price_change_7d"),
                        "market_cap": c.get("market_cap"),
                        "volume_24h": c.get("total_volume"),
                    }
                    break
    except Exception:
        logger.warning("Failed to get market overview for %s", symbol, exc_info=True)

    async with async_session() as session:
        # 2. Multi-timeframe OHLCV
        for timeframe, limit in [("1h", 48), ("4h", 30), ("1d", 30)]:
            stmt = (
                select(OHLCVData)
                .where(OHLCVData.symbol == symbol, OHLCVData.timeframe == timeframe)
                .order_by(OHLCVData.timestamp.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            rows = result.scalars().all()
            if rows:
                # Reverse to oldest-first for indicator calculations
                rows_asc = list(reversed(rows))
                closes = [float(r.close) for r in rows_asc]
                highs = [float(r.high) for r in rows_asc]
                lows = [float(r.low) for r in rows_asc]
                volumes = [float(r.volume) for r in rows_asc]
                latest = rows[0]  # newest
                summary = {
                    "timeframe": timeframe,
                    "candles": len(rows),
                    "latest_close": float(latest.close),
                    "latest_time": latest.timestamp.isoformat(),
                    "high": max(highs),
                    "low": min(lows),
                    "open_first": float(rows_asc[0].open),
                    "close_last": float(latest.close),
                    "change_pct": round(
                        (float(latest.close) - float(rows_asc[0].open))
                        / float(rows_asc[0].open)
                        * 100,
                        2,
                    )
                    if float(rows_asc[0].open) != 0
                    else 0,
                    "avg_volume": round(sum(volumes) / len(volumes), 2),
                    "max_volume": max(volumes),
                }
                indicators = compute_indicators(closes, highs, lows, volumes)
                if indicators:
                    summary["indicators"] = indicators
                snapshot[f"price_{timeframe}"] = summary

        # 3. DEX pairs matching this symbol
        stmt = (
            select(DexVolume)
            .where(DexVolume.pair.ilike(f"%{base}%"))
            .order_by(DexVolume.volume_24h.desc())
            .limit(10)
        )
        result = await session.execute(stmt)
        for r in result.scalars().all():
            snapshot["dex_pairs"].append(
                {
                    "pair": r.pair,
                    "chain": r.chain,
                    "dex": r.dex,
                    "volume_24h": float(r.volume_24h),
                    "liquidity": float(r.liquidity_usd),
                }
            )

        # 4. Related news — filter by base symbol keyword
        stmt = (
            select(NewsArticle)
            .where(NewsArticle.title.ilike(f"%{base}%"))
            .order_by(NewsArticle.published_at.desc())
            .limit(10)
        )
        result = await session.execute(stmt)
        for r in result.scalars().all():
            snapshot["recent_news"].append(
                {
                    "title": r.title,
                    "source": r.source,
                    "sentiment": r.sentiment,
                    "published_at": r.published_at.isoformat()
                    if r.published_at
                    else None,
                }
            )

    return snapshot

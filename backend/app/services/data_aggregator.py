"""Aggregate latest data from all sources for AI analysis."""

import json
import logging
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session
from app.models.market import OHLCVData, DexVolume, DefiMetric
from app.models.news import NewsArticle

logger = logging.getLogger(__name__)


async def get_latest_snapshot() -> dict:
    """Collect the latest data from all sources into a single snapshot."""
    snapshot = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "market_overview": [],
        "price_summary": [],
        "dex_top_pairs": [],
        "defi_top_protocols": [],
        "recent_news": [],
    }

    settings = get_settings()

    # 1. Market overview from Redis
    try:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        data = await r.get("market:overview")
        await r.aclose()
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
        logger.warning("Failed to get market overview from Redis", exc_info=True)

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
        stmt = (
            select(NewsArticle)
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
                    "published_at": r.published_at.isoformat() if r.published_at else None,
                }
            )

    return snapshot

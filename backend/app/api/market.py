import json
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, distinct, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings, Settings
from app.database import get_db
from app.models.market import OHLCVData, DexVolume, DefiMetric
from app.services.cache import cache_get

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/overview")
async def get_market_overview():
    """Get market overview from CoinGecko cache."""
    data = await cache_get("market:overview")
    if not data:
        return {"coins": [], "cached": False}
    return {"coins": json.loads(data), "cached": True}


@router.get("/kline")
async def get_kline(
    symbol: str = Query("BTC/USDT", description="Trading pair"),
    exchange: str = Query("binance", description="Exchange"),
    timeframe: str = Query("1h", description="Timeframe"),
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Get K-line (OHLCV) data."""
    stmt = (
        select(OHLCVData)
        .where(
            OHLCVData.symbol == symbol,
            OHLCVData.exchange == exchange,
            OHLCVData.timeframe == timeframe,
        )
        .order_by(OHLCVData.timestamp.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    # Return in ascending time order
    rows.reverse()
    return {
        "symbol": symbol,
        "exchange": exchange,
        "timeframe": timeframe,
        "data": [
            {
                "time": int(r.timestamp.timestamp()),
                "open": float(r.open),
                "high": float(r.high),
                "low": float(r.low),
                "close": float(r.close),
                "volume": float(r.volume),
            }
            for r in rows
        ],
    }


@router.get("/pairs")
async def get_pairs(db: AsyncSession = Depends(get_db)):
    """Get available trading pairs grouped by exchange."""
    stmt = select(
        distinct(OHLCVData.symbol), OHLCVData.exchange
    ).order_by(OHLCVData.exchange, OHLCVData.symbol)
    result = await db.execute(stmt)
    rows = result.all()
    pairs_by_exchange: dict[str, list[str]] = {}
    for symbol, exchange in rows:
        pairs_by_exchange.setdefault(exchange, []).append(symbol)
    return {"pairs": pairs_by_exchange}


@router.post("/collect")
async def trigger_collection():
    """Manually trigger data collection."""
    from app.collectors.cex import CEXCollector
    from app.collectors.coingecko import CoinGeckoCollector

    results = {}
    collectors = [
        ("cex", "app.collectors.cex", "CEXCollector"),
        ("coingecko", "app.collectors.coingecko", "CoinGeckoCollector"),
        ("dexscreener", "app.collectors.dexscreener", "DexScreenerCollector"),
        ("defillama", "app.collectors.defillama", "DefiLlamaCollector"),
        ("news", "app.collectors.news", "NewsCollector"),
    ]
    for name, module_path, class_name in collectors:
        try:
            import importlib
            mod = importlib.import_module(module_path)
            cls = getattr(mod, class_name)
            count = await cls().run()
            results[name] = {"status": "ok", "records": count}
        except Exception as e:
            results[name] = {"status": "error", "error": str(e)}

    return results


@router.get("/integrity")
async def get_data_integrity(
    symbol: str = Query("BTC/USDT"),
    exchange: str = Query("binance"),
    timeframe: str = Query("1h"),
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Check OHLCV data completeness and detect gaps."""
    interval_map = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}
    interval_sec = interval_map.get(timeframe)
    if not interval_sec:
        raise HTTPException(400, f"Unsupported timeframe: {timeframe}")

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)

    # Get all timestamps in range, ordered ascending
    stmt = (
        select(OHLCVData.timestamp)
        .where(
            OHLCVData.symbol == symbol,
            OHLCVData.exchange == exchange,
            OHLCVData.timeframe == timeframe,
            OHLCVData.timestamp >= start,
            OHLCVData.timestamp <= end,
        )
        .order_by(OHLCVData.timestamp.asc())
    )
    result = await db.execute(stmt)
    timestamps = [row[0] for row in result.all()]

    actual_count = len(timestamps)
    expected_count = int((end - start).total_seconds() / interval_sec)
    completeness = round(actual_count / expected_count * 100, 1) if expected_count > 0 else 0

    # Detect gaps: adjacent timestamps with interval > 1.5x expected
    gaps = []
    threshold = interval_sec * 1.5
    for i in range(1, len(timestamps)):
        gap_sec = (timestamps[i] - timestamps[i - 1]).total_seconds()
        if gap_sec > threshold:
            missing = int(gap_sec / interval_sec) - 1
            gaps.append({
                "from": timestamps[i - 1].isoformat(),
                "to": timestamps[i].isoformat(),
                "missing_candles": missing,
                "gap_hours": round(gap_sec / 3600, 1),
            })

    return {
        "symbol": symbol,
        "exchange": exchange,
        "timeframe": timeframe,
        "days": days,
        "expected_candles": expected_count,
        "actual_candles": actual_count,
        "completeness_pct": completeness,
        "gaps": gaps,
        "gap_count": len(gaps),
    }


@router.get("/dex")
async def get_dex_data(
    chain: str | None = Query(None, description="Filter by chain"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get DEX trading volume data from DexScreener."""
    stmt = select(DexVolume).order_by(DexVolume.volume_24h.desc()).limit(limit)
    if chain:
        stmt = stmt.where(DexVolume.chain == chain)
    # Only get latest snapshot (most recent timestamp)
    from sqlalchemy import func
    latest_ts = select(func.max(DexVolume.timestamp)).scalar_subquery()
    stmt = stmt.where(DexVolume.timestamp == latest_ts)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return {
        "data": [
            {
                "chain": r.chain,
                "dex": r.dex,
                "pair": r.pair,
                "volume_24h": float(r.volume_24h),
                "price_usd": float(r.price_usd),
                "liquidity_usd": float(r.liquidity_usd),
                "txns_24h": r.txns_24h,
            }
            for r in rows
        ]
    }


@router.get("/defi")
async def get_defi_data(
    category: str | None = Query(None, description="Filter by category"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get DeFi protocol metrics from DefiLlama."""
    stmt = select(DefiMetric).order_by(DefiMetric.tvl.desc()).limit(limit)
    if category:
        stmt = stmt.where(DefiMetric.category == category)
    from sqlalchemy import func
    latest_ts = select(func.max(DefiMetric.timestamp)).scalar_subquery()
    stmt = stmt.where(DefiMetric.timestamp == latest_ts)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return {
        "data": [
            {
                "protocol": r.protocol,
                "chain": r.chain,
                "tvl": float(r.tvl),
                "tvl_change_24h": float(r.tvl_change_24h) if r.tvl_change_24h else None,
                "category": r.category,
            }
            for r in rows
        ]
    }

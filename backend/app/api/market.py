import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.market import DefiMetric, DexVolume, FuturesMetric, OHLCVData
from app.services.cache import cache_get

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/market", tags=["market"])

# Cold cache + concurrent requests (e.g. after restart): single CoinGecko fetch.
_overview_fill_lock = asyncio.Lock()


async def ensure_market_overview_cached() -> None:
    """Populate Redis/memory cache from CoinGecko when missing."""
    data = await cache_get("market:overview")
    if data:
        return
    async with _overview_fill_lock:
        data = await cache_get("market:overview")
        if data:
            return
        try:
            from app.collectors.coingecko import CoinGeckoCollector
            from app.config import get_settings

            timeout = float(get_settings().scheduler_job_timeout_seconds)
            collector = CoinGeckoCollector()
            await asyncio.wait_for(collector.run(), timeout=timeout)
        except TimeoutError:
            logger.warning("Market overview fetch timed out")
        except Exception:
            logger.warning("Market overview fetch failed", exc_info=True)


@router.get("/overview")
async def get_market_overview():
    """Get market overview from CoinGecko cache, or fetch once if empty."""
    await ensure_market_overview_cached()
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
    indicators: str | None = Query(
        None, description="Comma-separated: ma,rsi,macd,bollinger"
    ),
    db: AsyncSession = Depends(get_db),
):
    """Get K-line (OHLCV) data with optional technical indicator series."""
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
    rows = list(result.scalars().all())
    # Return in ascending time order
    rows.reverse()

    response: dict = {
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

    if indicators and rows:
        from app.services.technical_indicators import compute_indicator_series

        closes = [float(r.close) for r in rows]
        highs = [float(r.high) for r in rows]
        lows = [float(r.low) for r in rows]
        volumes = [float(r.volume) for r in rows]
        wanted = {s.strip() for s in indicators.split(",")}
        series = compute_indicator_series(closes, highs, lows, volumes, wanted)
        # Attach time to each series for frontend convenience
        times = [int(r.timestamp.timestamp()) for r in rows]
        response["indicators"] = {
            name: [
                {"time": t, "value": v}
                for t, v in zip(times, values, strict=False)
                if v is not None
            ]
            for name, values in series.items()
        }

    return response


@router.get("/pairs")
async def get_pairs(db: AsyncSession = Depends(get_db)):
    """Get available trading pairs grouped by exchange."""
    stmt = select(distinct(OHLCVData.symbol), OHLCVData.exchange).order_by(
        OHLCVData.exchange, OHLCVData.symbol
    )
    result = await db.execute(stmt)
    rows = result.all()
    pairs_by_exchange: dict[str, list[str]] = {}
    for symbol, exchange in rows:
        pairs_by_exchange.setdefault(exchange, []).append(symbol)
    return {"pairs": pairs_by_exchange}


@router.get("/collect/{job_id}")
async def get_collection_job(job_id: str):
    """Poll status for an async manual collection job."""
    from app.services.manual_collect_jobs import get_job

    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return job


@router.post("/collect")
async def trigger_collection(background_tasks: BackgroundTasks):
    """Queue a full manual data collection run (returns immediately)."""
    from app.services.manual_collect_jobs import create_job, run_job

    job_id = create_job()
    background_tasks.add_task(run_job, job_id)
    return JSONResponse(
        status_code=202,
        content={"job_id": job_id, "status": "accepted"},
    )


@router.get("/integrity")
async def get_data_integrity(
    symbol: str = Query("BTC/USDT"),
    exchange: str = Query("binance"),
    timeframe: str = Query("1h"),
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Check OHLCV data completeness and detect gaps."""
    interval_map = {
        "1m": 60,
        "5m": 300,
        "15m": 900,
        "1h": 3600,
        "4h": 14400,
        "1d": 86400,
    }
    interval_sec = interval_map.get(timeframe)
    if not interval_sec:
        raise HTTPException(400, f"Unsupported timeframe: {timeframe}")

    end = datetime.now(UTC)
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
    completeness = (
        round(actual_count / expected_count * 100, 1) if expected_count > 0 else 0
    )

    # Detect gaps: adjacent timestamps with interval > 1.5x expected
    gaps = []
    threshold = interval_sec * 1.5
    for i in range(1, len(timestamps)):
        gap_sec = (timestamps[i] - timestamps[i - 1]).total_seconds()
        if gap_sec > threshold:
            missing = int(gap_sec / interval_sec) - 1
            gaps.append(
                {
                    "from": timestamps[i - 1].isoformat(),
                    "to": timestamps[i].isoformat(),
                    "missing_candles": missing,
                    "gap_hours": round(gap_sec / 3600, 1),
                }
            )

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


@router.get("/futures")
async def get_futures_data(
    symbol: str | None = Query(None, description="Filter by symbol, e.g. BTC/USDT"),
    db: AsyncSession = Depends(get_db),
):
    """Get latest futures metrics (funding rate, OI, long/short ratio)."""
    stmt = select(FuturesMetric).order_by(FuturesMetric.timestamp.desc())
    if symbol:
        stmt = stmt.where(FuturesMetric.symbol == symbol).limit(1)
    else:
        # Latest snapshot for all symbols
        latest_ts = select(func.max(FuturesMetric.timestamp)).scalar_subquery()
        stmt = stmt.where(FuturesMetric.timestamp == latest_ts)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return {
        "data": [
            {
                "symbol": r.symbol,
                "exchange": r.exchange,
                "funding_rate": float(r.funding_rate) if r.funding_rate else None,
                "open_interest": float(r.open_interest) if r.open_interest else None,
                "long_short_ratio": float(r.long_short_ratio)
                if r.long_short_ratio
                else None,
                "long_account_pct": float(r.long_account_pct)
                if r.long_account_pct
                else None,
                "short_account_pct": float(r.short_account_pct)
                if r.short_account_pct
                else None,
                "timestamp": r.timestamp.isoformat(),
            }
            for r in rows
        ]
    }


@router.get("/fear-greed")
async def get_fear_greed():
    """Get the latest Fear & Greed Index."""
    data = await cache_get("market:fear_greed")
    if not data:
        return {"data": None}
    return {"data": json.loads(data)}


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
    latest_ts = select(func.max(DexVolume.timestamp)).scalar_subquery()
    stmt = stmt.where(DexVolume.timestamp == latest_ts)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return {
        "data": [
            {
                "source": r.source,
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

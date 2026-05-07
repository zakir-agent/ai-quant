import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.collectors.coingecko import CoinGeckoCollector
from app.config import get_settings
from app.database import get_db
from app.models.market import DefiMetric, DexVolume, FuturesMetric, OHLCVData
from app.services.cache import cache_get, cache_set
from app.services.manual_collect_jobs import create_job, get_job, run_job
from app.services.technical_indicators import compute_indicator_series

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
            timeout = float(get_settings().scheduler_job_timeout_seconds)
            collector = CoinGeckoCollector()
            await asyncio.wait_for(collector.run(), timeout=timeout)
        except TimeoutError:
            logger.warning("Market overview fetch timed out")
        except Exception:
            logger.warning("Market overview fetch failed", exc_info=True)


@router.get("/overview")
async def get_market_overview() -> dict:
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
) -> dict:
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
async def get_pairs(db: AsyncSession = Depends(get_db)) -> dict:
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
async def get_collection_job(job_id: str) -> dict:
    """Poll status for an async manual collection job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return job


@router.post("/collect")
async def trigger_collection(background_tasks: BackgroundTasks) -> JSONResponse:
    """Queue a full manual data collection run (returns immediately)."""
    job_id = create_job()
    background_tasks.add_task(run_job, job_id)
    return JSONResponse(
        status_code=202,
        content={"job_id": job_id, "status": "accepted"},
    )


_INTERVAL_MAP = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
}


async def _compute_integrity(
    db: AsyncSession,
    symbol: str,
    exchange: str,
    timeframe: str,
    days: int,
    *,
    include_gaps: bool,
) -> dict:
    """Core integrity computation shared by /integrity and /integrity/summary."""
    interval_sec = _INTERVAL_MAP[timeframe]

    # Align `end` down to the most recently *closed* candle boundary so the
    # in-progress candle (which is naturally absent from DB) doesn't permanently
    # cap completeness at < 100%.
    now = datetime.now(UTC)
    end_epoch = int(now.timestamp()) // interval_sec * interval_sec
    end = datetime.fromtimestamp(end_epoch, tz=UTC)
    start = end - timedelta(days=days)

    stmt = (
        select(OHLCVData.timestamp)
        .where(
            OHLCVData.symbol == symbol,
            OHLCVData.exchange == exchange,
            OHLCVData.timeframe == timeframe,
            OHLCVData.timestamp >= start,
            OHLCVData.timestamp < end,
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
    threshold = interval_sec * 1.5
    gap_count = 0
    gaps: list[dict] = []
    for i in range(1, len(timestamps)):
        gap_sec = (timestamps[i] - timestamps[i - 1]).total_seconds()
        if gap_sec > threshold:
            gap_count += 1
            if include_gaps:
                missing = int(gap_sec / interval_sec) - 1
                gaps.append(
                    {
                        "from": timestamps[i - 1].isoformat(),
                        "to": timestamps[i].isoformat(),
                        "missing_candles": missing,
                        "gap_hours": round(gap_sec / 3600, 1),
                    }
                )

    payload = {
        "symbol": symbol,
        "exchange": exchange,
        "timeframe": timeframe,
        "days": days,
        "expected_candles": expected_count,
        "actual_candles": actual_count,
        "completeness_pct": completeness,
        "gap_count": gap_count,
    }
    if include_gaps:
        payload["gaps"] = gaps
    return payload


@router.get("/integrity")
async def get_data_integrity(
    symbol: str = Query("BTC/USDT"),
    exchange: str = Query("binance"),
    timeframe: str = Query("1h"),
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Check OHLCV data completeness and detect gaps for a single symbol/timeframe."""
    if timeframe not in _INTERVAL_MAP:
        raise HTTPException(400, f"Unsupported timeframe: {timeframe}")
    return await _compute_integrity(
        db, symbol, exchange, timeframe, days, include_gaps=True
    )


@router.get("/integrity/summary")
async def get_data_integrity_summary(
    days: int = Query(7, ge=1, le=90),
    timeframes: str = Query(
        "1h,4h,1d",
        description="Comma-separated list of timeframes to evaluate",
    ),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate completeness across all known (exchange, symbol) × timeframes.

    Returns one cell per (exchange, symbol, timeframe) without the per-gap
    detail list (use /integrity for that). Cached for 30s to avoid hammering
    the DB when the settings page rerenders.
    """
    tf_list = [tf.strip() for tf in timeframes.split(",") if tf.strip()]
    bad_tfs = [tf for tf in tf_list if tf not in _INTERVAL_MAP]
    if bad_tfs:
        raise HTTPException(400, f"Unsupported timeframe(s): {','.join(bad_tfs)}")

    cache_key = f"market:integrity:summary:{days}:{','.join(tf_list)}"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    pair_stmt = select(distinct(OHLCVData.symbol), OHLCVData.exchange).order_by(
        OHLCVData.exchange, OHLCVData.symbol
    )
    pair_rows = (await db.execute(pair_stmt)).all()

    cells: list[dict] = []
    for symbol, exchange in pair_rows:
        for tf in tf_list:
            cell = await _compute_integrity(
                db, symbol, exchange, tf, days, include_gaps=False
            )
            cells.append(cell)

    total = len(cells)
    healthy = sum(1 for c in cells if c["completeness_pct"] >= 95)
    warning = sum(1 for c in cells if 80 <= c["completeness_pct"] < 95)
    danger = total - healthy - warning
    total_gaps = sum(c["gap_count"] for c in cells)

    payload = {
        "days": days,
        "timeframes": tf_list,
        "cells": cells,
        "summary": {
            "total": total,
            "healthy": healthy,
            "warning": warning,
            "danger": danger,
            "total_gaps": total_gaps,
        },
        "generated_at": datetime.now(UTC).isoformat(),
    }
    await cache_set(cache_key, json.dumps(payload), ttl=30)
    return payload


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


@router.get("/dex/chains")
async def get_dex_chains(db: AsyncSession = Depends(get_db)):
    """Return distinct chains present in the latest DEX snapshot."""
    latest_ts = select(func.max(DexVolume.timestamp)).scalar_subquery()
    stmt = (
        select(DexVolume.chain)
        .where(DexVolume.timestamp == latest_ts)
        .distinct()
        .order_by(DexVolume.chain)
    )
    result = await db.execute(stmt)
    return {"chains": [row[0] for row in result.all()]}


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


@router.get("/defi/categories")
async def get_defi_categories(db: AsyncSession = Depends(get_db)):
    """Return distinct DeFi categories present in the latest snapshot."""
    latest_ts = select(func.max(DefiMetric.timestamp)).scalar_subquery()
    stmt = (
        select(DefiMetric.category)
        .where(DefiMetric.timestamp == latest_ts)
        .distinct()
        .order_by(DefiMetric.category)
    )
    result = await db.execute(stmt)
    return {"categories": [row[0] for row in result.all()]}


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


@router.get("/dex/history")
async def get_dex_history(
    pair: str | None = Query(None, description="Filter by pair (e.g. ETH/USDC)"),
    chain: str | None = Query(None, description="Filter by chain"),
    days: int = Query(7, ge=1, le=90),
    top: int | None = Query(
        None, ge=1, le=20, description="Number of top pairs by volume"
    ),
    db: AsyncSession = Depends(get_db),
):
    """Return time-series DEX volume data, grouped by pair."""
    from app.config import get_settings

    effective_top = top if top is not None else get_settings().chart_history_top_n
    since = datetime.now(UTC) - timedelta(days=days)

    if pair:
        pairs_filter = [pair]
    else:
        latest_ts = select(func.max(DexVolume.timestamp)).scalar_subquery()
        top_stmt = select(DexVolume.pair).where(DexVolume.timestamp == latest_ts)
        if chain:
            top_stmt = top_stmt.where(DexVolume.chain == chain)
        top_stmt = top_stmt.order_by(DexVolume.volume_24h.desc()).limit(effective_top)
        top_result = await db.execute(top_stmt)
        pairs_filter = [row[0] for row in top_result.all()]

    if not pairs_filter:
        return {"series": []}

    stmt = (
        select(DexVolume)
        .where(DexVolume.pair.in_(pairs_filter), DexVolume.timestamp >= since)
        .order_by(DexVolume.pair, DexVolume.timestamp)
    )
    if chain:
        stmt = stmt.where(DexVolume.chain == chain)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    grouped: dict[str, dict] = {}
    for r in rows:
        if r.pair not in grouped:
            grouped[r.pair] = {
                "pair": r.pair,
                "chain": r.chain,
                "dex": r.dex,
                "data": [],
            }
        grouped[r.pair]["data"].append(
            {
                "time": int(r.timestamp.timestamp()),
                "volume_24h": float(r.volume_24h),
                "liquidity_usd": float(r.liquidity_usd),
                "price_usd": float(r.price_usd),
            }
        )

    return {"series": list(grouped.values())}


@router.get("/defi/history")
async def get_defi_history(
    protocol: str | None = Query(None, description="Filter by protocol name"),
    category: str | None = Query(None, description="Filter by category"),
    days: int = Query(7, ge=1, le=90),
    top: int | None = Query(
        None, ge=1, le=20, description="Number of top protocols by TVL"
    ),
    db: AsyncSession = Depends(get_db),
):
    """Return time-series DeFi TVL data, grouped by protocol."""
    from app.config import get_settings

    effective_top = top if top is not None else get_settings().chart_history_top_n
    since = datetime.now(UTC) - timedelta(days=days)

    if protocol:
        protocols_filter = [protocol]
    else:
        latest_ts = select(func.max(DefiMetric.timestamp)).scalar_subquery()
        top_stmt = select(DefiMetric.protocol).where(DefiMetric.timestamp == latest_ts)
        if category:
            top_stmt = top_stmt.where(DefiMetric.category == category)
        top_stmt = top_stmt.order_by(DefiMetric.tvl.desc()).limit(effective_top)
        top_result = await db.execute(top_stmt)
        protocols_filter = [row[0] for row in top_result.all()]

    if not protocols_filter:
        return {"series": []}

    stmt = (
        select(DefiMetric)
        .where(DefiMetric.protocol.in_(protocols_filter), DefiMetric.timestamp >= since)
        .order_by(DefiMetric.protocol, DefiMetric.timestamp)
    )
    if category:
        stmt = stmt.where(DefiMetric.category == category)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    grouped: dict[str, dict] = {}
    for r in rows:
        if r.protocol not in grouped:
            grouped[r.protocol] = {
                "protocol": r.protocol,
                "chain": r.chain,
                "category": r.category,
                "data": [],
            }
        grouped[r.protocol]["data"].append(
            {
                "time": int(r.timestamp.timestamp()),
                "tvl": float(r.tvl),
            }
        )

    return {"series": list(grouped.values())}

"""Aggregate 1m kline data into 5m and 15m candles (zero API cost)."""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import get_settings
from app.database import async_session
from app.models.market import OHLCVData

logger = logging.getLogger(__name__)

_TARGET_TIMEFRAMES = [
    ("5m", 5),
    ("15m", 15),
]


def _floor_timestamp(ts: datetime, minutes: int) -> datetime:
    """Floor a timestamp to the nearest N-minute boundary."""
    total_minutes = ts.hour * 60 + ts.minute
    floored_minutes = (total_minutes // minutes) * minutes
    return ts.replace(
        hour=floored_minutes // 60, minute=floored_minutes % 60, second=0, microsecond=0
    )


async def aggregate_recent() -> int:
    """Aggregate recent 1m candles into 5m and 15m for all CEX symbols.

    Returns total number of aggregated records upserted.
    """
    settings = get_settings()
    symbols = [s.strip() for s in settings.cex_default_symbols.split(",") if s.strip()]
    total = 0

    for target_tf, bucket_minutes in _TARGET_TIMEFRAMES:
        lookback = timedelta(minutes=bucket_minutes * 6)
        since = datetime.now(UTC) - lookback

        for symbol in symbols:
            count = await _aggregate_symbol(
                symbol, "binance", bucket_minutes, target_tf, since
            )
            total += count

    return total


async def _aggregate_symbol(
    symbol: str,
    exchange: str,
    bucket_minutes: int,
    target_tf: str,
    since: datetime,
) -> int:
    """Aggregate 1m candles for a single symbol into the target timeframe."""
    async with async_session() as session:
        rows = (
            (
                await session.execute(
                    select(OHLCVData)
                    .where(
                        OHLCVData.symbol == symbol,
                        OHLCVData.exchange == exchange,
                        OHLCVData.timeframe == "1m",
                        OHLCVData.timestamp >= since,
                    )
                    .order_by(OHLCVData.timestamp)
                )
            )
            .scalars()
            .all()
        )

    if not rows:
        return 0

    buckets: dict[datetime, list] = {}
    for row in rows:
        bucket_ts = _floor_timestamp(row.timestamp, bucket_minutes)
        buckets.setdefault(bucket_ts, []).append(row)

    records = []
    for bucket_ts, candles in buckets.items():
        if len(candles) < bucket_minutes:
            continue
        records.append(
            {
                "symbol": symbol,
                "exchange": exchange,
                "timeframe": target_tf,
                "timestamp": bucket_ts,
                "open": candles[0].open,
                "high": max(c.high for c in candles),
                "low": min(c.low for c in candles),
                "close": candles[-1].close,
                "volume": sum(c.volume for c in candles),
            }
        )

    if not records:
        return 0

    async with async_session() as session:
        stmt = pg_insert(OHLCVData).values(records)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_ohlcv",
            set_={
                "open": stmt.excluded.open,
                "high": stmt.excluded.high,
                "low": stmt.excluded.low,
                "close": stmt.excluded.close,
                "volume": stmt.excluded.volume,
            },
        )
        await session.execute(stmt)
        await session.commit()

    return len(records)

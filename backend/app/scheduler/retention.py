"""Data retention: purge old fine-grained OHLCV rows."""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete

from app.config import get_settings
from app.database import async_session
from app.models.market import OHLCVData

logger = logging.getLogger(__name__)

# 1m data has a shorter retention (high volume).
_1M_TIMEFRAMES = {"1m"}
# Other fine-grained timeframes use the standard retention period.
FINE_TIMEFRAMES = {"1h", "2h", "4h"}


async def purge_old_ohlcv():
    """Delete fine-grained OHLCV rows older than their retention period."""
    settings = get_settings()
    total_deleted = 0

    # 1m data: shorter retention
    cutoff_1m = datetime.now(UTC) - timedelta(days=settings.data_retention_1m_days)
    async with async_session() as session:
        result = await session.execute(
            delete(OHLCVData).where(
                OHLCVData.timeframe.in_(_1M_TIMEFRAMES),
                OHLCVData.timestamp < cutoff_1m,
            )
        )
        await session.commit()
    if result.rowcount:
        logger.info(
            "Data retention: purged %d 1m rows older than %s",
            result.rowcount,
            cutoff_1m.date(),
        )
        total_deleted += result.rowcount

    # Other fine-grained: standard retention
    cutoff = datetime.now(UTC) - timedelta(days=settings.data_retention_days)
    async with async_session() as session:
        result = await session.execute(
            delete(OHLCVData).where(
                OHLCVData.timeframe.in_(FINE_TIMEFRAMES),
                OHLCVData.timestamp < cutoff,
            )
        )
        await session.commit()
    if result.rowcount:
        logger.info(
            "Data retention: purged %d fine-grained rows older than %s",
            result.rowcount,
            cutoff.date(),
        )
        total_deleted += result.rowcount

    return total_deleted

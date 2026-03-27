"""Data retention: purge old fine-grained OHLCV rows to stay within Supabase free-tier storage."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, func

from app.config import get_settings
from app.database import async_session
from app.models.market import OHLCVData

logger = logging.getLogger(__name__)

# Timeframes considered "fine-grained" (will be purged after retention period).
# Daily ("1d") and weekly ("1w") data is kept indefinitely.
FINE_TIMEFRAMES = {"1m", "5m", "15m", "30m", "1h", "2h", "4h"}


async def purge_old_ohlcv():
    """Delete fine-grained OHLCV rows older than DATA_RETENTION_DAYS."""
    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.data_retention_days)

    async with async_session() as session:
        result = await session.execute(
            delete(OHLCVData).where(
                OHLCVData.timeframe.in_(FINE_TIMEFRAMES),
                OHLCVData.timestamp < cutoff,
            )
        )
        await session.commit()

    deleted = result.rowcount
    if deleted:
        logger.info("Data retention: purged %d OHLCV rows older than %s", deleted, cutoff.date())
    return deleted

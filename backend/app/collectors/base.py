"""Base collector interface for all data collectors."""

import logging
import time
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class BaseCollector(ABC):
    """Base class for all data collectors.

    Subclasses implement the collect → transform → store pipeline.
    """

    @abstractmethod
    def name(self) -> str:
        """Collector name for logging."""
        ...

    @abstractmethod
    async def collect(self) -> dict:
        """Fetch raw data from the external source."""
        ...

    @abstractmethod
    async def transform(self, raw_data: dict) -> list:
        """Transform raw data into model instances."""
        ...

    @abstractmethod
    async def store(self, records: list) -> int:
        """Store records to the database. Returns count of stored records."""
        ...

    async def run(self) -> int:
        """Execute the full collect → transform → store pipeline."""
        from app.services.collector_health import record_failure, record_success

        collector_name = self.name()
        total_started_at = time.perf_counter()
        try:
            collect_started_at = time.perf_counter()
            raw = await self.collect()
            collect_ms = (time.perf_counter() - collect_started_at) * 1000

            transform_started_at = time.perf_counter()
            records = await self.transform(raw)
            transform_ms = (time.perf_counter() - transform_started_at) * 1000

            store_started_at = time.perf_counter()
            count = await self.store(records)
            store_ms = (time.perf_counter() - store_started_at) * 1000
            total_ms = (time.perf_counter() - total_started_at) * 1000

            raw_size = len(raw) if isinstance(raw, (dict, list, tuple, set)) else None
            logger.info(
                "[%s] Pipeline success raw_size=%s transformed=%s stored=%s "
                "collect_ms=%.2f transform_ms=%.2f store_ms=%.2f total_ms=%.2f",
                collector_name,
                raw_size,
                len(records),
                count,
                collect_ms,
                transform_ms,
                store_ms,
                total_ms,
            )
            record_success(collector_name)
            return count
        except Exception as e:
            total_ms = (time.perf_counter() - total_started_at) * 1000
            logger.exception(
                "[%s] Pipeline failed error_type=%s total_ms=%.2f",
                collector_name,
                type(e).__name__,
                total_ms,
            )
            record_failure(collector_name, str(e))
            raise

"""Base collector interface for all data collectors."""

import logging
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

        try:
            raw = await self.collect()
            records = await self.transform(raw)
            count = await self.store(records)
            collector_name = self.name()
            logger.info(f"[{collector_name}] Collected {count} records")
            record_success(collector_name)
            return count
        except Exception as e:
            collector_name = self.name()
            logger.exception(f"[{collector_name}] Collection failed")
            record_failure(collector_name, str(e))
            raise

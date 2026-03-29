"""Base collector interface for all data collectors."""

import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class BaseCollector(ABC):
    """Base class for all data collectors.

    Subclasses implement the collect → transform → store pipeline.
    """

    @property
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
        from app.services.collector_health import record_success, record_failure

        try:
            raw = await self.collect()
            records = await self.transform(raw)
            count = await self.store(records)
            logger.info(f"[{self.name}] Collected {count} records")
            record_success(self.name)
            return count
        except Exception as e:
            logger.exception(f"[{self.name}] Collection failed")
            record_failure(self.name, str(e))
            raise

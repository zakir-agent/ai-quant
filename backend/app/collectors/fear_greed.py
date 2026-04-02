"""Fear & Greed Index collector from Alternative.me API."""

import logging
from datetime import UTC, datetime

import httpx

from app.collectors.base import BaseCollector
from app.services.cache import cache_set

logger = logging.getLogger(__name__)

API_URL = "https://api.alternative.me/fng/?limit=1&format=json"


class FearGreedCollector(BaseCollector):
    def name(self) -> str:
        return "fear_greed"

    async def collect(self) -> dict:
        """Fetch the latest Fear & Greed Index."""
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(API_URL)
            resp.raise_for_status()
            return resp.json()

    async def transform(self, raw_data: dict) -> list:
        """Extract the index value and classification."""
        items = raw_data.get("data", [])
        if not items:
            return []
        entry = items[0]
        return [
            {
                "value": int(entry["value"]),
                "classification": entry["value_classification"],
                "timestamp": datetime.fromtimestamp(
                    int(entry["timestamp"]), tz=UTC
                ).isoformat(),
            }
        ]

    async def store(self, records: list) -> int:
        """Store to Redis cache (this index updates daily, no need for DB table)."""
        if not records:
            return 0
        import json

        await cache_set(
            "market:fear_greed", json.dumps(records[0], ensure_ascii=False), ttl=3600
        )
        return 1

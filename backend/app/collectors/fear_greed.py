"""Fear & Greed Index collector from Alternative.me API."""

import json
import logging
from datetime import UTC, datetime

import httpx

from app.collectors.base import BaseCollector
from app.config import get_settings
from app.services.cache import cache_set

logger = logging.getLogger(__name__)


class FearGreedCollector(BaseCollector):
    def name(self) -> str:
        return "fear_greed"

    async def collect(self) -> dict:
        """Fetch the latest Fear & Greed Index."""
        settings = get_settings()
        async with httpx.AsyncClient(timeout=settings.http_timeout_default) as client:
            resp = await client.get(settings.fear_greed_api_url)
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
        settings = get_settings()
        await cache_set(
            "market:fear_greed",
            json.dumps(records[0], ensure_ascii=False),
            ttl=settings.fear_greed_cache_ttl,
        )
        return 1

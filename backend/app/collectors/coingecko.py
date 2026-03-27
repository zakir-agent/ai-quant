"""CoinGecko market overview collector."""

import logging
from datetime import datetime, timezone

import httpx

from app.collectors.base import BaseCollector
from app.database import async_session

logger = logging.getLogger(__name__)

COINGECKO_BASE = "https://api.coingecko.com/api/v3"
DEFAULT_IDS = "bitcoin,ethereum,solana,binancecoin,ripple,cardano,dogecoin,tron,chainlink,polkadot"


class CoinGeckoCollector(BaseCollector):
    name = "coingecko"

    def __init__(self, coin_ids: str | None = None):
        self.coin_ids = coin_ids or DEFAULT_IDS

    async def collect(self) -> dict:
        """Fetch market overview from CoinGecko."""
        url = f"{COINGECKO_BASE}/coins/markets"
        params = {
            "vs_currency": "usd",
            "ids": self.coin_ids,
            "order": "market_cap_desc",
            "per_page": 50,
            "page": 1,
            "sparkline": False,
            "price_change_percentage": "1h,24h,7d",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            return {"coins": resp.json(), "collected_at": datetime.now(timezone.utc).isoformat()}

    async def transform(self, raw_data: dict) -> list[dict]:
        """Transform CoinGecko response into simplified market data."""
        coins = raw_data.get("coins", [])
        results = []
        for coin in coins:
            results.append(
                {
                    "id": coin["id"],
                    "symbol": coin["symbol"].upper(),
                    "name": coin["name"],
                    "current_price": coin.get("current_price"),
                    "market_cap": coin.get("market_cap"),
                    "market_cap_rank": coin.get("market_cap_rank"),
                    "total_volume": coin.get("total_volume"),
                    "price_change_24h": coin.get("price_change_percentage_24h"),
                    "price_change_7d": coin.get("price_change_percentage_7d_in_currency"),
                    "price_change_1h": coin.get("price_change_percentage_1h_in_currency"),
                    "circulating_supply": coin.get("circulating_supply"),
                    "ath": coin.get("ath"),
                    "image": coin.get("image"),
                }
            )
        return results

    async def store(self, records: list[dict]) -> int:
        """Store market overview in cache (not DB — changes too frequently)."""
        import json
        from app.services.cache import cache_set

        await cache_set("market:overview", json.dumps(records, default=str), ttl=600)
        return len(records)

"""DexScreener API collector for DEX trading data."""

import logging
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.collectors.base import BaseCollector
from app.database import async_session
from app.models.market import DexVolume

logger = logging.getLogger(__name__)

DEXSCREENER_BASE = "https://api.dexscreener.com"

# Top pairs to track across chains
DEFAULT_SEARCH_QUERIES = ["WETH USDC", "WBTC USDC", "SOL USDC", "PEPE WETH", "ARB WETH"]


class DexScreenerCollector(BaseCollector):
    name = "dexscreener"

    def __init__(self, queries: list[str] | None = None):
        self.queries = queries or DEFAULT_SEARCH_QUERIES

    async def collect(self) -> dict:
        """Fetch top DEX pairs from DexScreener."""
        all_pairs = []
        async with httpx.AsyncClient(timeout=30) as client:
            # Get trending/boosted pairs for broad coverage
            try:
                resp = await client.get(f"{DEXSCREENER_BASE}/token-boosts/top/v1")
                if resp.status_code == 200:
                    boosts = resp.json()
                    # Extract token addresses to look up pairs
                    for item in boosts[:10]:
                        token_addr = item.get("tokenAddress", "")
                        chain = item.get("chainId", "")
                        if token_addr and chain:
                            try:
                                pair_resp = await client.get(
                                    f"{DEXSCREENER_BASE}/tokens/v1/{chain}/{token_addr}"
                                )
                                if pair_resp.status_code == 200:
                                    pairs_data = pair_resp.json()
                                    if isinstance(pairs_data, list):
                                        all_pairs.extend(pairs_data[:3])
                            except Exception:
                                logger.debug(f"Failed to fetch pairs for {chain}/{token_addr}")
            except Exception:
                logger.warning("Failed to fetch boosted tokens", exc_info=True)

            # Also search for specific well-known pairs
            for query in self.queries:
                try:
                    resp = await client.get(
                        f"{DEXSCREENER_BASE}/latest/dex/search",
                        params={"q": query},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        pairs = data.get("pairs", [])
                        all_pairs.extend(pairs[:5])
                except Exception:
                    logger.warning(f"Failed to search for {query}", exc_info=True)

        return {"pairs": all_pairs, "collected_at": datetime.now(timezone.utc).isoformat()}

    async def transform(self, raw_data: dict) -> list[dict]:
        """Transform DexScreener pairs into DexVolume records."""
        seen = set()
        records = []
        now = datetime.now(timezone.utc)

        for pair in raw_data.get("pairs", []):
            chain = pair.get("chainId", "unknown")
            dex = pair.get("dexId", "unknown")
            base = pair.get("baseToken", {}).get("symbol", "?")
            quote = pair.get("quoteToken", {}).get("symbol", "?")
            pair_name = f"{base}/{quote}"

            key = (chain, dex, pair_name)
            if key in seen:
                continue
            seen.add(key)

            volume_24h = pair.get("volume", {}).get("h24", 0) or 0
            price_usd = float(pair.get("priceUsd", 0) or 0)
            liquidity = pair.get("liquidity", {}).get("usd", 0) or 0
            txns = pair.get("txns", {}).get("h24", {})
            txns_24h = (txns.get("buys", 0) or 0) + (txns.get("sells", 0) or 0)

            records.append(
                {
                    "chain": chain,
                    "dex": dex,
                    "pair": pair_name,
                    "volume_24h": Decimal(str(volume_24h)),
                    "price_usd": Decimal(str(price_usd)),
                    "liquidity_usd": Decimal(str(liquidity)),
                    "txns_24h": txns_24h,
                    "timestamp": now,
                }
            )
        return records

    async def store(self, records: list[dict]) -> int:
        if not records:
            return 0
        async with async_session() as session:
            stmt = pg_insert(DexVolume).values(records)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_dex_volume",
                set_={
                    "volume_24h": stmt.excluded.volume_24h,
                    "price_usd": stmt.excluded.price_usd,
                    "liquidity_usd": stmt.excluded.liquidity_usd,
                    "txns_24h": stmt.excluded.txns_24h,
                },
            )
            await session.execute(stmt)
            await session.commit()
        return len(records)

"""DefiLlama API collector for DeFi protocol metrics."""

import logging
from datetime import UTC, datetime
from decimal import Decimal

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.collectors.base import BaseCollector
from app.config import get_settings
from app.database import async_session
from app.models.market import DefiMetric

logger = logging.getLogger(__name__)

DEFILLAMA_BASE = "https://api.llama.fi"

# Normalise raw DefiLlama category strings to canonical kebab-case slugs
# used by the frontend filter dropdown.
_RAW_CATEGORY_MAP: dict[str, str] = {
    "dexes": "dex",
    "dex": "dex",
    "liquid staking": "liquid-staking",
    "liquid restaking": "liquid-restaking",
    "staking pool": "staking",
    "lending": "lending",
    "cdp": "cdp",
    "yield": "yield",
    "yield aggregator": "yield",
    "restaking": "restaking",
    "synthetics": "synthetic",
    "bridge": "bridge",
    "derivatives": "derivatives",
    "cex": "cex",
}


def _normalise_category(raw: str | None) -> str:
    """Convert a raw DefiLlama category to the canonical kebab-case slug."""
    if not raw:
        return "other"
    key = raw.strip().lower()
    if key in _RAW_CATEGORY_MAP:
        return _RAW_CATEGORY_MAP[key]
    return key.replace(" ", "-")


class DefiLlamaCollector(BaseCollector):
    def name(self) -> str:
        return "defillama"

    def __init__(self, top_n: int = 20):
        self.top_n = top_n

    async def collect(self) -> dict:
        """Fetch top DeFi protocols from DefiLlama."""
        settings = get_settings()
        async with httpx.AsyncClient(timeout=settings.http_timeout_default) as client:
            resp = await client.get(f"{DEFILLAMA_BASE}/protocols")
            resp.raise_for_status()
            protocols = resp.json()
        return {"protocols": protocols, "collected_at": datetime.now(UTC).isoformat()}

    async def transform(self, raw_data: dict) -> list[dict]:
        """Transform DefiLlama protocols into DefiMetric records."""
        protocols = raw_data.get("protocols", [])
        # Sort by TVL descending, take top N
        protocols.sort(key=lambda p: float(p.get("tvl", 0) or 0), reverse=True)
        top = protocols[: self.top_n]

        now = datetime.now(UTC)
        records = []
        for p in top:
            slug = p.get("slug", "")
            tvl = float(p.get("tvl", 0) or 0)
            change_1d = p.get("change_1d")

            # Determine chain — use main chain or "multi"
            chains = p.get("chains", [])
            chain = chains[0].lower() if len(chains) == 1 else "multi"

            category = _normalise_category(p.get("category"))

            records.append(
                {
                    "protocol": slug,
                    "chain": chain,
                    "tvl": Decimal(str(round(tvl, 2))),
                    "tvl_change_24h": Decimal(str(round(float(change_1d or 0), 4))),
                    "category": category,
                    "timestamp": now,
                }
            )
        return records

    async def store(self, records: list[dict]) -> int:
        if not records:
            return 0
        async with async_session() as session:
            stmt = pg_insert(DefiMetric).values(records)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_defi_metric",
                set_={
                    "tvl": stmt.excluded.tvl,
                    "tvl_change_24h": stmt.excluded.tvl_change_24h,
                    "category": stmt.excluded.category,
                },
            )
            await session.execute(stmt)
            await session.commit()
        return len(records)

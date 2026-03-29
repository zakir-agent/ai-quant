"""Unified cache service — Redis or in-memory, controlled by settings.redis_url.

Redis connection is reused via a module-level singleton to avoid creating
a new connection on every cache operation.
"""

import logging
import time

logger = logging.getLogger(__name__)

# In-memory store: {key: (value, expire_timestamp)}
_mem_store: dict[str, tuple[str, float]] = {}

# Singleton Redis connection (lazy-initialized)
_redis_client = None


def _redis_enabled() -> bool:
    from app.config import get_settings

    return bool(get_settings().redis_url)


async def _get_redis():
    """Get or create the shared Redis connection."""
    global _redis_client
    if _redis_client is None:
        import redis.asyncio as aioredis

        from app.config import get_settings

        _redis_client = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis_client


async def close_redis():
    """Close the shared Redis connection (call on shutdown)."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


async def cache_get(key: str) -> str | None:
    """Get a value from cache."""
    if _redis_enabled():
        r = await _get_redis()
        return await r.get(key)

    # In-memory fallback
    entry = _mem_store.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if time.time() > expires_at:
        _mem_store.pop(key, None)
        return None
    return value


async def cache_set(key: str, value: str, ttl: int = 600) -> None:
    """Set a value in cache with TTL (seconds)."""
    if _redis_enabled():
        r = await _get_redis()
        await r.set(key, value, ex=ttl)
        return

    # In-memory fallback
    _mem_store[key] = (value, time.time() + ttl)


async def cache_ping() -> bool:
    """Check cache health. Returns True if healthy."""
    if _redis_enabled():
        r = await _get_redis()
        await r.ping()
        return True
    return True  # In-memory is always healthy

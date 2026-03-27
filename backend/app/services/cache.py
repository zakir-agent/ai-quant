"""Unified cache service — Redis or in-memory, controlled by settings.redis_url."""

import json
import logging
import time

logger = logging.getLogger(__name__)

# In-memory store: {key: (value, expire_timestamp)}
_mem_store: dict[str, tuple[str, float]] = {}


def _redis_enabled() -> bool:
    from app.config import get_settings
    return bool(get_settings().redis_url)


async def cache_get(key: str) -> str | None:
    """Get a value from cache."""
    if _redis_enabled():
        import redis.asyncio as aioredis
        from app.config import get_settings
        r = aioredis.from_url(get_settings().redis_url, decode_responses=True)
        try:
            return await r.get(key)
        finally:
            await r.aclose()

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
        import redis.asyncio as aioredis
        from app.config import get_settings
        r = aioredis.from_url(get_settings().redis_url, decode_responses=True)
        try:
            await r.set(key, value, ex=ttl)
        finally:
            await r.aclose()
        return

    # In-memory fallback
    _mem_store[key] = (value, time.time() + ttl)


async def cache_ping() -> bool:
    """Check cache health. Returns True if healthy."""
    if _redis_enabled():
        import redis.asyncio as aioredis
        from app.config import get_settings
        r = aioredis.from_url(get_settings().redis_url, decode_responses=True)
        try:
            await r.ping()
            return True
        finally:
            await r.aclose()
    return True  # In-memory is always healthy

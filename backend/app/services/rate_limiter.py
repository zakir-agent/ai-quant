"""Shared Binance REST API rate limiter.

Tracks request weight in a sliding 60-second window and pauses callers
when the budget is exhausted. This sits ON TOP of CCXT's built-in rate
limiting for extra safety.
"""

import asyncio
import logging
import time

from app.config import get_settings

logger = logging.getLogger(__name__)


class BinanceRateLimiter:
    """Sliding-window rate limiter for Binance REST API weight budget."""

    def __init__(self, max_weight_per_minute: int | None = None):
        settings = get_settings()
        self._max_weight = max_weight_per_minute or settings.binance_rate_limit_budget
        self._window_start: float = 0.0
        self._weight_used: int = 0
        self._lock = asyncio.Lock()

    async def acquire(self, weight: int = 1):
        """Acquire rate limit budget. Sleeps if budget is exhausted."""
        async with self._lock:
            now = time.monotonic()
            if now - self._window_start >= 60:
                self._window_start = now
                self._weight_used = 0

            if self._weight_used + weight > self._max_weight:
                sleep_time = 60 - (now - self._window_start) + 0.5
                logger.warning(
                    "Rate limit budget exhausted (%d/%d), sleeping %.1fs",
                    self._weight_used,
                    self._max_weight,
                    sleep_time,
                )
                await asyncio.sleep(sleep_time)
                self._window_start = time.monotonic()
                self._weight_used = 0

            self._weight_used += weight

    @property
    def remaining(self) -> int:
        now = time.monotonic()
        if now - self._window_start >= 60:
            return self._max_weight
        return max(0, self._max_weight - self._weight_used)


rate_limiter = BinanceRateLimiter()

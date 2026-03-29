"""In-memory collector health tracking with optional Redis persistence."""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

ALERT_THRESHOLD = 3  # consecutive failures to trigger alert


@dataclass
class CollectorStatus:
    last_success_at: datetime | None = None
    last_failure_at: datetime | None = None
    consecutive_failures: int = 0
    last_error: str = ""
    last_run_at: datetime | None = None

    @property
    def healthy(self) -> bool:
        return self.consecutive_failures < ALERT_THRESHOLD

    @property
    def status(self) -> str:
        if self.consecutive_failures == 0:
            return "ok" if self.last_success_at else "pending"
        if self.consecutive_failures >= ALERT_THRESHOLD:
            return "alert"
        return "degraded"

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "healthy": self.healthy,
            "consecutive_failures": self.consecutive_failures,
            "last_success_at": self.last_success_at.isoformat()
            if self.last_success_at
            else None,
            "last_failure_at": self.last_failure_at.isoformat()
            if self.last_failure_at
            else None,
            "last_error": self.last_error,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
        }


# Global registry
_registry: dict[str, CollectorStatus] = {}


def record_success(name: str) -> None:
    """Record a successful collection run."""
    now = datetime.now(UTC)
    status = _registry.setdefault(name, CollectorStatus())
    was_alerting = status.consecutive_failures >= ALERT_THRESHOLD
    status.consecutive_failures = 0
    status.last_success_at = now
    status.last_run_at = now
    status.last_error = ""

    if was_alerting:
        import asyncio

        from app.services.alerting import notify

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(notify(
                f"collector_{name}_recovered",
                f"Collector {name} recovered",
                "Collection is working again.",
            ))
        except RuntimeError:
            logger.warning("No running event loop, skipping recovery alert for %s", name)


def record_failure(name: str, error: str) -> None:
    """Record a failed collection run."""
    now = datetime.now(UTC)
    status = _registry.setdefault(name, CollectorStatus())
    status.consecutive_failures += 1
    status.last_failure_at = now
    status.last_run_at = now
    status.last_error = error[:500]

    if status.consecutive_failures >= ALERT_THRESHOLD:
        logger.warning(
            "[%s] ALERT: %d consecutive failures. Last error: %s",
            name,
            status.consecutive_failures,
            status.last_error,
        )
        # Fire async alert (best-effort, don't block)
        import asyncio

        from app.services.alerting import notify

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(notify(
                f"collector_{name}_down",
                f"Collector {name} down",
                f"Consecutive failures: {status.consecutive_failures}\nError: {status.last_error}",
            ))
        except RuntimeError:
            logger.warning("No running event loop, skipping failure alert for %s", name)


def get_health(name: str) -> dict:
    """Get health status for a single collector."""
    status = _registry.get(name, CollectorStatus())
    return {"name": name, **status.to_dict()}


def get_all_health() -> list[dict]:
    """Get health status for all known collectors."""
    return [
        {"name": name, **status.to_dict()} for name, status in sorted(_registry.items())
    ]

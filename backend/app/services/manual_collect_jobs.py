"""In-memory status for async manual market collection jobs."""

from __future__ import annotations

import importlib
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

MAX_JOBS = 100

COLLECTORS: list[tuple[str, str, str]] = [
    ("cex", "app.collectors.cex", "CEXCollector"),
    ("coingecko", "app.collectors.coingecko", "CoinGeckoCollector"),
    ("dexscreener", "app.collectors.dexscreener", "DexScreenerCollector"),
    ("defillama", "app.collectors.defillama", "DefiLlamaCollector"),
    ("futures", "app.collectors.futures", "FuturesCollector"),
    ("fear_greed", "app.collectors.fear_greed", "FearGreedCollector"),
    ("news", "app.collectors.news", "NewsCollector"),
]

_jobs: dict[str, dict[str, Any]] = {}


def _prune_if_needed() -> None:
    """Drop oldest finished jobs when registry grows past MAX_JOBS."""
    target = MAX_JOBS - 1
    if len(_jobs) <= target:
        return
    finished = [
        (jid, j.get("finished_at") or "")
        for jid, j in _jobs.items()
        if j.get("status") in ("completed", "failed")
    ]
    finished.sort(key=lambda x: x[1])
    for jid, _ in finished:
        if len(_jobs) <= target:
            return
        _jobs.pop(jid, None)
    while len(_jobs) > target:
        oldest = min(
            _jobs.items(),
            key=lambda kv: kv[1].get("started_at") or "",
        )
        _jobs.pop(oldest[0], None)


def create_job() -> str:
    job_id = str(uuid4())
    now = datetime.now(UTC).isoformat()
    _jobs[job_id] = {
        "status": "accepted",
        "started_at": now,
        "finished_at": None,
        "results": None,
        "error": None,
    }
    _prune_if_needed()
    return job_id


def mark_running(job_id: str) -> None:
    job = _jobs.get(job_id)
    if not job:
        return
    job["status"] = "running"


def mark_completed(job_id: str, results: dict[str, Any]) -> None:
    job = _jobs.get(job_id)
    if not job:
        return
    job["status"] = "completed"
    job["finished_at"] = datetime.now(UTC).isoformat()
    job["results"] = results


def mark_failed(job_id: str, error: str) -> None:
    job = _jobs.get(job_id)
    if not job:
        return
    job["status"] = "failed"
    job["finished_at"] = datetime.now(UTC).isoformat()
    job["error"] = error[:2000]


def get_job(job_id: str) -> dict[str, Any] | None:
    job = _jobs.get(job_id)
    if not job:
        return None
    return {
        "job_id": job_id,
        "status": job["status"],
        "started_at": job["started_at"],
        "finished_at": job["finished_at"],
        "results": job["results"],
        "error": job["error"],
    }


async def execute_manual_collect() -> dict[str, Any]:
    """Run all market collectors sequentially (same behavior as legacy sync endpoint)."""
    results: dict[str, Any] = {}
    for name, module_path, class_name in COLLECTORS:
        try:
            mod = importlib.import_module(module_path)
            cls = getattr(mod, class_name)
            count = await cls().run()
            results[name] = {"status": "ok", "records": count}
        except Exception as e:
            logger.exception("Manual collect failed for %s", name)
            results[name] = {"status": "error", "error": str(e)}
    return results


async def run_job(job_id: str) -> None:
    mark_running(job_id)
    try:
        results = await execute_manual_collect()
        mark_completed(job_id, results)
    except Exception as e:
        logger.exception("Manual collect job %s failed", job_id)
        mark_failed(job_id, str(e))

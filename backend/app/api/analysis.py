"""Analysis API — trigger AI runs and read historical reports."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.engine import run_analysis as do_analysis
from app.analysis.serializers import report_to_dict
from app.config import get_settings
from app.database import get_db
from app.models.analysis import AnalysisReport
from app.services.accuracy_tracker import get_accuracy_stats
from app.services.ai_client import AIError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/symbols")
async def get_analysis_symbols():
    """Per-symbol scopes from ``AI_ANALYSIS_SYMBOLS`` (comma-separated ccxt pairs)."""
    settings = get_settings()
    symbols = [
        s.strip() for s in (settings.ai_analysis_symbols or "").split(",") if s.strip()
    ]
    return {"symbols": symbols}


@router.post("/run")
async def run_analysis(
    scope: str = Query(
        "market",
        description="Analysis scope: 'market' or a trading-pair symbol like 'BTC/USDT'",
    ),
    model: str | None = Query(None, description="Override the AI model"),
):
    """Trigger an AI analysis run."""
    try:
        return await do_analysis(scope=scope, model=model)
    except ValueError as exc:
        # Daily quota / invalid scope errors are user-facing.
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except AIError as exc:
        logger.exception("AI analysis failed for scope=%s", scope)
        raise HTTPException(
            status_code=502, detail=f"AI provider error: {exc}"
        ) from exc


@router.get("/latest")
async def get_latest_analysis(
    scope: str = Query("market"),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent analysis report for the given scope."""
    stmt = (
        select(AnalysisReport)
        .where(AnalysisReport.scope == scope)
        .order_by(AnalysisReport.created_at.desc())
        .limit(1)
    )
    report = (await db.execute(stmt)).scalar_one_or_none()
    return {"report": report_to_dict(report) if report else None}


@router.get("/history")
async def get_analysis_history(
    scope: str = Query("market"),
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Return historical analysis reports for the given scope (newest first)."""
    base = (
        select(AnalysisReport)
        .where(AnalysisReport.scope == scope)
        .order_by(AnalysisReport.created_at.desc())
    )
    rows = (await db.execute(base.offset(offset).limit(limit + 1))).scalars().all()
    has_more = len(rows) > limit
    reports = rows[:limit]
    return {"reports": [report_to_dict(r) for r in reports], "has_more": has_more}


@router.get("/accuracy-stats")
async def accuracy_stats(scope: str = Query("market")):
    """Return cached rolling accuracy stats."""
    stats = await get_accuracy_stats()
    return stats

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis import AnalysisReport

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.post("/run")
async def run_analysis(
    scope: str = Query(
        "market", description="Analysis scope: market or specific symbol"
    ),
    model: str | None = Query(None, description="Override AI model"),
):
    """Trigger an AI analysis run."""
    from app.analysis.engine import run_analysis as do_analysis

    result = await do_analysis(scope=scope, model=model)
    return result


@router.get("/latest")
async def get_latest_analysis(
    scope: str = Query("market"),
    db: AsyncSession = Depends(get_db),
):
    """Get the latest analysis report."""
    stmt = (
        select(AnalysisReport)
        .where(AnalysisReport.scope == scope)
        .order_by(AnalysisReport.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    report = result.scalar_one_or_none()
    if not report:
        return {"report": None}
    return {
        "report": {
            "id": report.id,
            "scope": report.scope,
            "model_used": report.model_used,
            "sentiment_score": report.sentiment_score,
            "trend": report.trend,
            "risk_level": report.risk_level,
            "summary": report.summary,
            "recommendations": report.recommendations,
            "technical_analysis": (report.data_sources or {}).get("technical_analysis"),
            "token_usage": report.token_usage,
            "created_at": report.created_at.isoformat(),
        }
    }


@router.get("/history")
async def get_analysis_history(
    scope: str = Query("market"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get historical analysis reports."""
    stmt = (
        select(AnalysisReport)
        .where(AnalysisReport.scope == scope)
        .order_by(AnalysisReport.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return {
        "reports": [
            {
                "id": r.id,
                "scope": r.scope,
                "model_used": r.model_used,
                "sentiment_score": r.sentiment_score,
                "trend": r.trend,
                "risk_level": r.risk_level,
                "summary": r.summary,
                "recommendations": r.recommendations,
                "technical_analysis": (r.data_sources or {}).get("technical_analysis"),
                "token_usage": r.token_usage,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }

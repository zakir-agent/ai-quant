"""Core analysis engine — orchestrates data aggregation, AI call, and result storage."""

import json
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func

from app.analysis.prompts import SYSTEM_PROMPT, PROMPT_VERSION, build_analysis_prompt
from app.config import get_settings
from app.database import async_session
from app.models.analysis import AnalysisReport
from app.services.ai_client import ai_completion
from app.services.data_aggregator import get_latest_snapshot

logger = logging.getLogger(__name__)


async def run_analysis(scope: str = "market", model: str | None = None) -> dict:
    """Run a full AI analysis cycle.

    1. Aggregate latest data
    2. Build prompt
    3. Call AI
    4. Parse and store result
    5. Return the report
    """
    settings = get_settings()

    # Check daily limit
    async with async_session() as session:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        stmt = select(func.count(AnalysisReport.id)).where(
            AnalysisReport.created_at >= today_start
        )
        result = await session.execute(stmt)
        count_today = result.scalar() or 0
        if count_today >= settings.ai_max_analyses_per_day:
            raise ValueError(
                f"Daily analysis limit reached ({settings.ai_max_analyses_per_day}). "
                f"Already ran {count_today} analyses today."
            )

    # 1. Aggregate data
    snapshot = await get_latest_snapshot()

    # 2. Build prompt
    prompt = build_analysis_prompt(snapshot)

    # 3. Call AI
    ai_result = await ai_completion(
        prompt=prompt,
        system=SYSTEM_PROMPT,
        model=model,
    )

    content = ai_result["content"]

    # 4. Parse result
    if isinstance(content, dict):
        parsed = content
    else:
        # AI returned a string, try to extract meaningful data
        parsed = {
            "sentiment_score": 0,
            "trend": "neutral",
            "risk_level": "medium",
            "summary": str(content)[:500],
            "key_observations": [],
            "recommendations": [],
            "risk_warnings": ["AI 返回格式异常，请检查原始响应"],
        }

    # 5. Store report
    report = AnalysisReport(
        scope=scope,
        model_used=ai_result["model"],
        prompt_version=PROMPT_VERSION,
        sentiment_score=int(parsed.get("sentiment_score", 0)),
        trend=parsed.get("trend", "neutral"),
        risk_level=parsed.get("risk_level", "medium"),
        summary=parsed.get("summary", ""),
        recommendations=parsed.get("recommendations"),
        data_sources=snapshot,
        token_usage=ai_result["usage"],
    )

    async with async_session() as session:
        session.add(report)
        await session.commit()
        await session.refresh(report)

    logger.info(
        f"Analysis complete: scope={scope}, sentiment={report.sentiment_score}, "
        f"trend={report.trend}, cost=${ai_result['usage']['cost_usd']}"
    )

    return {
        "id": report.id,
        "scope": report.scope,
        "model_used": report.model_used,
        "sentiment_score": report.sentiment_score,
        "trend": report.trend,
        "risk_level": report.risk_level,
        "summary": report.summary,
        "key_observations": parsed.get("key_observations", []),
        "recommendations": report.recommendations,
        "risk_warnings": parsed.get("risk_warnings", []),
        "token_usage": report.token_usage,
        "created_at": report.created_at.isoformat(),
    }

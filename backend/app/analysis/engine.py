"""Core AI analysis engine.

The pipeline is split into small, testable steps:

    1. ``_assert_under_daily_limit`` — daily quota guard
    2. ``_collect_snapshot``         — pull data via ``data_aggregator``
    3. ``_build_messages``           — render prompts based on scope
    4. ``_invoke_model``             — call LiteLLM with structured output
    5. ``_persist_report``           — validate + persist a row
    6. serialize via ``report_to_dict``

Each step is intentionally stateless and side-effect free except for the
final persistence step, so that future scenarios (dry-run, replay, batch
runs) can compose them differently.
"""

from __future__ import annotations

import logging

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.prompts import (
    PROMPT_VERSION,
    SYMBOL_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    build_market_prompt,
    build_symbol_prompt,
)
from app.analysis.schemas import AnalysisOutput, output_json_schema
from app.analysis.serializers import report_to_dict
from app.database import async_session
from app.models.analysis import AnalysisReport
from app.services.ai_client import AIError, ai_completion
from app.services.ai_quota import assert_under_daily_limit
from app.services.data_aggregator import get_latest_snapshot, get_symbol_snapshot

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def run_analysis(scope: str = "market", model: str | None = None) -> dict:
    """Run a full AI analysis cycle and return the persisted report.

    ``scope`` is either ``"market"`` for a market-wide run or a trading-pair
    symbol like ``"BTC/USDT"`` for a single-symbol deep dive.
    """
    async with async_session() as session:
        await _assert_under_daily_limit(session)

    snapshot = await _collect_snapshot(scope)
    system, user = _build_messages(scope, snapshot)

    ai_result = await ai_completion(
        prompt=user,
        system=system,
        model=model,
        json_schema=output_json_schema(),
    )

    parsed = _coerce_output(ai_result["content"])

    async with async_session() as session:
        report = await _persist_report(
            session=session,
            scope=scope,
            snapshot=snapshot,
            parsed=parsed,
            ai_result=ai_result,
        )

    logger.info(
        "Analysis complete: scope=%s sentiment=%s trend=%s cost=$%s",
        scope,
        report.sentiment_score,
        report.trend,
        ai_result["usage"]["cost_usd"],
    )

    return report_to_dict(report)


# ---------------------------------------------------------------------------
# Pipeline steps
# ---------------------------------------------------------------------------


async def _assert_under_daily_limit(session: AsyncSession) -> None:
    await assert_under_daily_limit(session)


async def _collect_snapshot(scope: str) -> dict:
    if _is_market_scope(scope):
        return await get_latest_snapshot()
    return await get_symbol_snapshot(scope)


def _build_messages(scope: str, snapshot: dict) -> tuple[str, str]:
    if _is_market_scope(scope):
        return SYSTEM_PROMPT, build_market_prompt(snapshot)
    return SYMBOL_SYSTEM_PROMPT, build_symbol_prompt(snapshot)


def _coerce_output(content: object) -> AnalysisOutput:
    """Validate and normalize the model's response.

    The model must return schema-valid content. If parsing/validation fails we
    raise ``AIError`` so the caller can report failure and skip persistence.
    """
    if isinstance(content, dict):
        try:
            parsed = AnalysisOutput.model_validate(content)
        except ValidationError as exc:
            logger.warning("AI output failed schema validation: %s", exc)
            raise AIError("AI analysis output failed schema validation") from exc
        if not _has_meaningful_content(parsed):
            logger.warning("AI output validated but content is empty")
            raise AIError("AI analysis output content is empty")
        return parsed

    logger.warning("AI output is not a JSON object: type=%s", type(content).__name__)
    raise AIError("AI analysis output format is invalid")


def _has_meaningful_content(parsed: AnalysisOutput) -> bool:
    if parsed.summary.strip():
        return True
    if parsed.key_observations:
        return True
    if parsed.recommendations:
        return True
    if parsed.risk_warnings:
        return True
    tech = parsed.technical_analysis
    if tech is None:
        return False
    if tech.key_observation.strip():
        return True
    if tech.support_levels or tech.resistance_levels:
        return True
    return False


async def _persist_report(
    *,
    session: AsyncSession,
    scope: str,
    snapshot: dict,
    parsed: AnalysisOutput,
    ai_result: dict,
) -> AnalysisReport:
    technical = (
        parsed.technical_analysis.model_dump()
        if parsed.technical_analysis is not None
        else None
    )
    report = AnalysisReport(
        scope=scope,
        model_used=ai_result["model"],
        prompt_version=PROMPT_VERSION,
        sentiment_score=parsed.sentiment_score,
        trend=parsed.trend,
        risk_level=parsed.risk_level,
        summary=parsed.summary,
        key_observations=list(parsed.key_observations),
        recommendations=[r.model_dump() for r in parsed.recommendations],
        risk_warnings=list(parsed.risk_warnings),
        technical_analysis=technical,
        data_sources=snapshot,
        token_usage=ai_result["usage"],
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


def _is_market_scope(scope: str) -> bool:
    return scope == "market"

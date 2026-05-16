"""Serialization helpers for AnalysisReport.

Single source of truth for the JSON shape returned by both ``/api/analysis``
endpoints and the engine's ``run_analysis`` return value, so the API layer
doesn't need to repeat the field list.
"""

from __future__ import annotations

from app.models.analysis import AnalysisReport


def report_to_dict(report: AnalysisReport) -> dict:
    """Render a stored ``AnalysisReport`` row to the public JSON shape."""
    data_sources = report.data_sources or {}

    return {
        "id": report.id,
        "scope": report.scope,
        "model_used": report.model_used,
        "prompt_version": report.prompt_version,
        "sentiment_score": report.sentiment_score,
        "trend": report.trend,
        "risk_level": report.risk_level,
        "summary": report.summary,
        "key_observations": report.key_observations or [],
        "recommendations": report.recommendations or [],
        "risk_warnings": report.risk_warnings or [],
        "technical_analysis": report.technical_analysis,
        "token_usage": report.token_usage,
        "accuracy": report.accuracy,
        "created_at": report.created_at.isoformat(),
        "data_sources_summary": {
            "market_overview": bool(data_sources.get("market_overview")),
            "futures_data": bool(data_sources.get("futures_data")),
            "dex_volume": bool(data_sources.get("dex_volume")),
            "fear_greed_index": data_sources.get("fear_greed_index", {}).get("value"),
            "news_count": len(data_sources.get("news", [])),
            "timestamp": data_sources.get("timestamp"),
        },
    }

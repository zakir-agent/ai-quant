"""Pydantic schemas for per-article news AI analysis.

Used both for:
1. validating the LLM's structured output before persisting,
2. driving ``response_format`` so providers return JSON natively.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

NEWS_PROMPT_VERSION = "news-v1"

EventType = Literal[
    "LISTING",
    "DELISTING",
    "HACK",
    "EXPLOIT",
    "PARTNERSHIP",
    "UPGRADE",
    "REGULATION",
    "MACRO",
    "FUNDRAISE",
    "TOKEN_UNLOCK",
    "WHALE",
    "OPINION",
    "OTHER",
]
TimeHorizon = Literal["IMMEDIATE", "INTRADAY", "SWING", "LONG_TERM"]
AssetRole = Literal["primary", "secondary"]


class NewsAsset(BaseModel):
    """An asset mentioned in the article. ``role`` separates the headline
    subject (``primary``) from incidental mentions (``secondary``)."""

    model_config = ConfigDict(extra="ignore")

    code: str
    role: AssetRole = "primary"

    @field_validator("code", mode="before")
    @classmethod
    def _normalize_code(cls, value: object) -> str:
        if not isinstance(value, str):
            return ""
        # Strip exchange/quote suffixes so "BTC/USDT" → "BTC".
        token = value.strip().upper().split("/")[0]
        # Drop common ticker prefixes ("$BTC").
        return token.lstrip("$")


class NewsAnalysisOutput(BaseModel):
    """Strict structured output expected from the news LLM call."""

    model_config = ConfigDict(extra="ignore")

    news_id: int
    is_actionable: bool = False
    assets: list[NewsAsset] = Field(default_factory=list)

    direction: int = Field(0, ge=-1, le=1)
    magnitude: int = Field(0, ge=0, le=100)
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    confidence_reason: str = ""

    event_type: EventType = "OTHER"
    time_horizon: TimeHorizon = "INTRADAY"
    intensity: int = Field(0, ge=0, le=100)
    relevance_score: int = Field(0, ge=0, le=100)

    tags: list[str] = Field(default_factory=list)
    raw_quote: str = ""
    summary_zh: str = ""

    @field_validator("direction", mode="before")
    @classmethod
    def _coerce_direction(cls, value: object) -> int:
        try:
            v = int(round(float(value)))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0
        if v > 0:
            return 1
        if v < 0:
            return -1
        return 0

    @field_validator("magnitude", "intensity", "relevance_score", mode="before")
    @classmethod
    def _clamp_unit(cls, value: object) -> int:
        try:
            v = int(round(float(value)))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0
        return max(0, min(100, v))

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp_confidence(cls, value: object) -> float:
        try:
            v = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0.0
        return max(0.0, min(1.0, v))

    def primary_asset(self) -> str | None:
        for a in self.assets:
            if a.role == "primary" and a.code:
                return a.code
        if self.assets and self.assets[0].code:
            return self.assets[0].code
        return None


class NewsAnalysisBatchOutput(BaseModel):
    """Container that holds the per-article analyses for one batch call."""

    model_config = ConfigDict(extra="ignore")

    results: list[NewsAnalysisOutput] = Field(default_factory=list)


def news_batch_json_schema() -> dict:
    """JSON schema fed to LiteLLM ``response_format`` to constrain the output."""
    return {
        "name": "news_analysis_batch",
        "schema": NewsAnalysisBatchOutput.model_json_schema(),
        "strict": False,
    }

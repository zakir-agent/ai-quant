"""Pydantic schemas for AI analysis input contracts and structured outputs.

These schemas serve two purposes:
1. Validate and normalize the LLM's JSON output before persisting it.
2. Provide a JSON schema we can hand to LiteLLM via `response_format` so the
   model is forced to return well-formed structured data.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Vocabulary shared across both market-wide and symbol-scoped reports.
TrendLiteral = Literal["bullish", "bearish", "neutral"]
RiskLiteral = Literal["low", "medium", "high"]
ActionLiteral = Literal["buy", "sell", "hold", "watch"]
ConfidenceLiteral = Literal["high", "medium", "low"]
TFTrendLiteral = Literal["up", "down", "sideways"]


class TechnicalAnalysis(BaseModel):
    """Multi-timeframe technical read for a single symbol."""

    model_config = ConfigDict(extra="ignore")

    trend_1h: TFTrendLiteral = "sideways"
    trend_4h: TFTrendLiteral = "sideways"
    trend_1d: TFTrendLiteral = "sideways"
    support_levels: list[float] = Field(default_factory=list)
    resistance_levels: list[float] = Field(default_factory=list)
    key_observation: str = ""


class Recommendation(BaseModel):
    """A single trade idea returned by the model."""

    model_config = ConfigDict(extra="ignore")

    symbol: str | None = None
    action: ActionLiteral = "watch"
    reason: str = ""
    entry_price: float | None = None
    target_price: float | None = None
    stop_loss: float | None = None
    confidence: ConfidenceLiteral = "medium"


class AnalysisOutput(BaseModel):
    """Strict structured output expected from the LLM.

    `technical_analysis` is only populated by symbol-scoped runs but accepting
    it in both schemas keeps the engine code uniform.
    """

    model_config = ConfigDict(extra="ignore")

    sentiment_score: int = Field(0, ge=-100, le=100)
    trend: TrendLiteral = "neutral"
    risk_level: RiskLiteral = "medium"
    summary: str = ""
    key_observations: list[str] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    risk_warnings: list[str] = Field(default_factory=list)
    technical_analysis: TechnicalAnalysis | None = None

    @field_validator("sentiment_score", mode="before")
    @classmethod
    def _coerce_sentiment(cls, value: object) -> int:
        try:
            score = int(round(float(value)))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0
        return max(-100, min(100, score))


def output_json_schema() -> dict:
    """Return the JSON schema used to constrain the LLM response.

    Wrapped in a structure compatible with OpenAI's `response_format` /
    `json_schema` mode. Providers that don't support JSON schema fall back to
    `json_object` automatically inside `ai_client.ai_completion`.
    """
    schema = AnalysisOutput.model_json_schema()
    return {
        "name": "analysis_output",
        "schema": schema,
        "strict": False,
    }

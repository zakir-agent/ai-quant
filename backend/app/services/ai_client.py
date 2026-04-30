"""LiteLLM wrapper for multi-model AI calls.

Model names use LiteLLM format — the prefix determines the provider:
  gpt-* → OpenAI, gemini/gemini-2.5-flash → Google, claude-* → Anthropic,
  openrouter/model-name → OpenRouter, etc.
API keys are read from env vars (loaded via dotenv at startup).
Full list: https://docs.litellm.ai/docs/providers
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any

import litellm

from app.config import get_settings

logger = logging.getLogger(__name__)

# Suppress litellm verbose logging
litellm.suppress_debug_info = True

# Retry config
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2  # seconds


class AIError(RuntimeError):
    """Raised when the AI call fails after all retries / fallbacks."""


class AIResponseParseError(AIError):
    """Raised when the AI response cannot be coerced into the expected JSON."""


async def _call_with_retry(
    model: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    response_format: dict | None,
):
    """Call LiteLLM with exponential backoff retry. Returns the raw response."""
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if response_format is not None:
                kwargs["response_format"] = response_format
            return await litellm.acompletion(**kwargs)
        except Exception as e:
            last_exc = e
            if attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
                logger.warning(
                    "Model %s attempt %s/%s failed, retrying in %ss: %s",
                    model,
                    attempt,
                    MAX_RETRIES,
                    delay,
                    e,
                )
                await asyncio.sleep(delay)
    assert last_exc is not None
    raise AIError(
        f"Model {model} failed after {MAX_RETRIES} attempts: {last_exc}"
    ) from last_exc


async def ai_completion(
    prompt: str,
    system: str = "",
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    json_schema: dict | None = None,
) -> dict:
    """Call the AI model and return parsed content + usage info.

    When ``json_schema`` is provided we ask the provider for structured JSON via
    ``response_format``. Providers that don't support full JSON schema fall back
    to ``json_object`` automatically inside this helper. The caller is still
    responsible for *validating* the parsed result against a Pydantic schema.

    Returns:
        {
            "content": dict | str,
            "model": str,
            "usage": {"input": int, "output": int, "cost_usd": float}
        }
    """
    settings = get_settings()
    primary = model or settings.ai_primary_model
    fallback = settings.ai_fallback_model

    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response_format: dict | None
    if json_schema is not None:
        response_format = {"type": "json_schema", "json_schema": json_schema}
    else:
        response_format = None

    response, used_model = await _try_models_with_format_fallback(
        primary, fallback, messages, temperature, max_tokens, response_format
    )

    assert hasattr(response, "choices"), "Expected non-streaming ModelResponse"
    raw_content = response.choices[0].message.content
    parsed = _parse_json_response(raw_content)

    cost = 0.0
    with contextlib.suppress(Exception):
        cost = litellm.completion_cost(completion_response=response)

    usage = getattr(response, "usage", None)
    return {
        "content": parsed,
        "model": used_model,
        "usage": {
            "input": usage.prompt_tokens if usage else 0,
            "output": usage.completion_tokens if usage else 0,
            "cost_usd": round(cost, 6),
        },
    }


async def _try_models_with_format_fallback(
    primary: str,
    fallback: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    response_format: dict | None,
):
    """Try (primary, fallback) × (json_schema, json_object, plain) until one works."""
    candidates = [primary]
    if fallback and fallback != primary:
        candidates.append(fallback)

    last_err: Exception | None = None
    for mdl in candidates:
        for fmt in _format_fallback_chain(response_format):
            try:
                resp = await _call_with_retry(
                    mdl, messages, temperature, max_tokens, fmt
                )
                return resp, mdl
            except AIError as e:
                last_err = e
                logger.warning(
                    "AI call failed (model=%s, format=%s): %s",
                    mdl,
                    _fmt_kind(fmt),
                    e,
                )
                continue
    assert last_err is not None
    raise last_err


def _format_fallback_chain(response_format: dict | None) -> list[dict | None]:
    """Build a graceful-degradation chain for response_format.

    Some providers don't accept ``json_schema`` (and a few not even
    ``json_object``), so we walk down to plain text rather than crashing.
    """
    if response_format is None:
        return [None]
    return [response_format, {"type": "json_object"}, None]


def _fmt_kind(fmt: dict | None) -> str:
    if fmt is None:
        return "plain"
    return fmt.get("type", "unknown")


def _parse_json_response(raw: str | None) -> Any:
    """Try to parse the AI response as JSON, handling common wrapping styles."""
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return text

    # Direct JSON
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        pass
    # ```json ... ``` block
    if "```json" in text:
        try:
            return json.loads(text.split("```json", 1)[1].split("```", 1)[0].strip())
        except (json.JSONDecodeError, IndexError):
            pass
    # ``` ... ``` block
    if "```" in text:
        try:
            return json.loads(text.split("```", 1)[1].split("```", 1)[0].strip())
        except (json.JSONDecodeError, IndexError):
            pass
    return text

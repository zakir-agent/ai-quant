"""LiteLLM wrapper for multi-model AI calls.

Model names use LiteLLM format — the prefix determines the provider:
  gemini/gemini-2.5-flash → Google, claude-* → Anthropic, gpt-* → OpenAI,
  openrouter/model-name → OpenRouter, etc.
API keys are read from env vars (loaded via dotenv at startup).
Full list: https://docs.litellm.ai/docs/providers
"""

import contextlib
import json
import logging

import litellm

from app.config import get_settings

logger = logging.getLogger(__name__)

# Suppress litellm verbose logging
litellm.suppress_debug_info = True


async def ai_completion(
    prompt: str,
    system: str = "",
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> dict:
    """Call AI model via LiteLLM and return parsed JSON response with usage info.

    Returns:
        {
            "content": str | dict,
            "model": str,
            "usage": {"input": int, "output": int, "cost_usd": float}
        }
    """
    settings = get_settings()
    model = model or settings.ai_primary_model

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        response = await litellm.acompletion(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as e:
        fallback = settings.ai_fallback_model
        if fallback and fallback != model:
            logger.warning(f"Model {model} failed, trying fallback {fallback}: {e}")
            response = await litellm.acompletion(
                model=fallback,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            model = fallback
        else:
            raise

    raw_content = response.choices[0].message.content
    usage = response.usage

    # Try to parse as JSON
    content = _parse_json_response(raw_content)

    cost = 0.0
    with contextlib.suppress(Exception):
        cost = litellm.completion_cost(completion_response=response)

    return {
        "content": content,
        "model": model,
        "usage": {
            "input": usage.prompt_tokens if usage else 0,
            "output": usage.completion_tokens if usage else 0,
            "cost_usd": round(cost, 6),
        },
    }


def _parse_json_response(raw: str):
    """Try to parse AI response as JSON, handling markdown code blocks."""
    if not raw:
        return raw
    # Direct JSON
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        pass
    # ```json ... ``` block
    if "```json" in raw:
        try:
            return json.loads(raw.split("```json")[1].split("```")[0].strip())
        except (json.JSONDecodeError, IndexError):
            pass
    # ``` ... ``` block
    if "```" in raw:
        try:
            return json.loads(raw.split("```")[1].split("```")[0].strip())
        except (json.JSONDecodeError, IndexError):
            pass
    return raw

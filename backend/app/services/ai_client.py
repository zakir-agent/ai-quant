"""LiteLLM wrapper for multi-model AI calls."""

import json
import logging
import os

import litellm

from app.config import get_settings

logger = logging.getLogger(__name__)

# Suppress litellm verbose logging
litellm.suppress_debug_info = True


def _configure_keys():
    """Set API keys as env vars for LiteLLM."""
    settings = get_settings()
    if settings.anthropic_api_key:
        os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
    if settings.openai_api_key:
        os.environ["OPENAI_API_KEY"] = settings.openai_api_key
    # For custom OpenAI-compatible endpoints, LiteLLM reads OPENAI_API_KEY
    if settings.ai_custom_api_key and not settings.openai_api_key:
        os.environ["OPENAI_API_KEY"] = settings.ai_custom_api_key


def _resolve_model(model: str | None) -> tuple[str, dict]:
    """Resolve model name and build extra kwargs for LiteLLM.

    For custom OpenAI-compatible endpoints,
    prepend 'openai/' to model name and pass api_base + api_key.

    Returns:
        (model_name, extra_kwargs)
    """
    settings = get_settings()

    # If caller specifies "custom" or the model matches ai_custom_model,
    # or no standard keys are set but custom endpoint is configured — use custom.
    use_custom = False
    if model == "custom":
        use_custom = True
        model = None
    elif model and settings.ai_custom_base_url and model == settings.ai_custom_model:
        use_custom = True

    if use_custom or (
        model is None
        and settings.ai_custom_base_url
        and settings.ai_custom_model
    ):
        # Use custom OpenAI-compatible endpoint
        custom_model = settings.ai_custom_model
        # LiteLLM requires "openai/" prefix for custom OpenAI-compatible endpoints
        litellm_model = f"openai/{custom_model}"
        extra = {
            "api_base": settings.ai_custom_base_url,
            "api_key": settings.ai_custom_api_key or "unused",
        }
        return litellm_model, extra

    # Standard model
    model = model or settings.ai_primary_model
    return model, {}


async def ai_completion(
    prompt: str,
    system: str = "",
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> dict:
    """Call AI model via LiteLLM and return parsed JSON response with usage info.

    Supports:
    - Standard models: Claude, GPT, etc. (model="claude-sonnet-4-20250514")
    - Custom OpenAI-compatible: openrouter (model="custom" or model=ai_custom_model)

    Returns:
        {
            "content": str | dict,
            "model": str,
            "usage": {"input": int, "output": int, "cost_usd": float}
        }
    """
    _configure_keys()
    settings = get_settings()

    resolved_model, extra_kwargs = _resolve_model(model)
    display_model = model or resolved_model

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        response = await litellm.acompletion(
            model=resolved_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            **extra_kwargs,
        )
    except Exception as e:
        # Try fallback: custom → standard fallback, or standard → standard fallback
        fallback = settings.ai_fallback_model
        if fallback and fallback != resolved_model:
            logger.warning(f"Model {display_model} failed, trying fallback {fallback}: {e}")
            fallback_model, fallback_kwargs = _resolve_model(fallback)
            response = await litellm.acompletion(
                model=fallback_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **fallback_kwargs,
            )
            display_model = fallback
        else:
            raise

    raw_content = response.choices[0].message.content
    usage = response.usage

    # Try to parse as JSON
    content = _parse_json_response(raw_content)

    # Calculate cost (may not work for custom models)
    cost = 0.0
    try:
        cost = litellm.completion_cost(completion_response=response)
    except Exception:
        pass

    return {
        "content": content,
        "model": display_model,
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

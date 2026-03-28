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
    # Note: Do NOT set ai_custom_api_key as OPENAI_API_KEY.
    # Custom endpoint keys are passed explicitly via api_key in _resolve_model.
    # Setting it as env var would cause standard OpenAI calls to use the wrong key.


def _resolve_model(model: str | None) -> tuple[str, dict]:
    """Resolve model name and build extra kwargs for LiteLLM.

    Routing logic:
    1. model="custom" → custom endpoint with ai_custom_model
    2. model matches ai_custom_model → custom endpoint
    3. No standard API keys but custom endpoint configured → custom endpoint
       (all models routed through custom, e.g. OpenRouter supports many models)
    4. Otherwise → standard provider (Anthropic/OpenAI) based on model name

    Returns:
        (model_name, extra_kwargs)
    """
    settings = get_settings()
    has_custom_endpoint = bool(settings.ai_custom_base_url)
    has_standard_keys = bool(settings.anthropic_api_key or settings.openai_api_key)

    # Normalize "custom" to the configured custom model name
    if model == "custom":
        model = None

    # Decide whether to route through the custom endpoint
    use_custom = False
    if has_custom_endpoint:
        if model is None:
            # No model specified — use custom if configured
            use_custom = bool(settings.ai_custom_model)
        elif model == settings.ai_custom_model:
            # Explicit match with the custom model
            use_custom = True
        elif not has_standard_keys:
            # No standard keys — route everything through custom endpoint
            use_custom = True

    if use_custom:
        custom_model = model or settings.ai_custom_model
        litellm_model = f"openai/{custom_model}"
        extra = {
            "api_base": settings.ai_custom_base_url,
            "api_key": settings.ai_custom_api_key or "unused",
        }
        return litellm_model, extra

    # Standard model — LiteLLM routes by prefix (claude-* → Anthropic, gpt-* → OpenAI)
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

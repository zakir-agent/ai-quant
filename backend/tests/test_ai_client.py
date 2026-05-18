"""Tests for LiteLLM client custom gateway settings."""

import asyncio
from unittest.mock import AsyncMock, patch

from app.config import get_settings
from app.services import ai_client


def test_litellm_extra_kwargs_from_settings(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("AI_API_BASE", "http://gateway.local/v1")
    monkeypatch.setenv("AI_API_KEY", "test-key")
    get_settings.cache_clear()

    extra = ai_client._litellm_extra_kwargs()
    assert extra == {
        "api_base": "http://gateway.local/v1",
        "api_key": "test-key",
    }
    get_settings.cache_clear()


def test_call_with_retry_passes_custom_gateway(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("AI_API_BASE", "http://gateway.local/v1")
    monkeypatch.setenv("AI_API_KEY", "test-key")
    get_settings.cache_clear()

    mock_completion = AsyncMock(return_value="ok")

    async def run():
        with patch.object(ai_client.litellm, "acompletion", mock_completion):
            await ai_client._call_with_retry(
                "my-model",
                [{"role": "user", "content": "hi"}],
                0.3,
                100,
                None,
            )

    asyncio.run(run())

    mock_completion.assert_awaited_once()
    kwargs = mock_completion.await_args.kwargs
    assert kwargs["api_base"] == "http://gateway.local/v1"
    assert kwargs["api_key"] == "test-key"
    assert kwargs["model"] == "my-model"
    get_settings.cache_clear()

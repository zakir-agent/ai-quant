import asyncio

from app.analysis import engine
from app.services.ai_client import AIError


def test_run_analysis_does_not_persist_when_output_format_invalid(monkeypatch):
    async def fake_assert_under_daily_limit(_session):
        return None

    async def fake_collect_snapshot(_scope: str):
        return {"source": "test"}

    def fake_build_messages(_scope: str, _snapshot: dict):
        return "system", "prompt"

    async def fake_ai_completion(**_kwargs):
        return {
            "content": "not-a-json-object",
            "model": "test-model",
            "usage": {"input": 1, "output": 1, "cost_usd": 0.0},
        }

    persisted = {"called": False}

    async def fake_persist_report(**_kwargs):
        persisted["called"] = True
        return None

    class DummySession:
        pass

    class DummySessionCtx:
        async def __aenter__(self):
            return DummySession()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(engine, "_assert_under_daily_limit", fake_assert_under_daily_limit)
    monkeypatch.setattr(engine, "_collect_snapshot", fake_collect_snapshot)
    monkeypatch.setattr(engine, "_build_messages", fake_build_messages)
    monkeypatch.setattr(engine, "ai_completion", fake_ai_completion)
    monkeypatch.setattr(engine, "_persist_report", fake_persist_report)
    monkeypatch.setattr(engine, "async_session", lambda: DummySessionCtx())

    try:
        asyncio.run(engine.run_analysis(scope="market"))
        assert False, "Expected AIError for invalid AI output format"
    except AIError:
        pass

    assert persisted["called"] is False


def test_coerce_output_raises_for_schema_invalid_payload():
    try:
        engine._coerce_output({"sentiment_score": "not-a-number", "trend": "moon"})
        assert False, "Expected AIError for invalid schema payload"
    except AIError:
        pass


def test_coerce_output_raises_for_semantically_empty_payload():
    try:
        engine._coerce_output({"sentiment_score": 30, "trend": "bullish"})
        assert False, "Expected AIError for semantically empty payload"
    except AIError:
        pass

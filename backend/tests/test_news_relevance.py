"""Tests for news relevance filtering service."""

from app.config import get_settings
from app.services import news_relevance


def test_parse_watchlist_normalizes_symbols(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("AI_ANALYSIS_SYMBOLS", "BTC/USDT, ETH/USDT, SOL")
    get_settings.cache_clear()

    result = news_relevance._parse_watchlist()
    assert result == ["BTC", "ETH", "SOL"]
    get_settings.cache_clear()


def test_parse_watchlist_empty(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("AI_ANALYSIS_SYMBOLS", "")
    get_settings.cache_clear()

    result = news_relevance._parse_watchlist()
    assert result == []
    get_settings.cache_clear()


def test_resolve_model_uses_lightweight(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("AI_LIGHTWEIGHT_MODEL", "custom/model")
    monkeypatch.setenv("AI_FALLBACK_MODEL", "fallback/model")
    monkeypatch.setenv("AI_PRIMARY_MODEL", "primary/model")
    get_settings.cache_clear()

    result = news_relevance._resolve_model()
    assert result == "custom/model"
    get_settings.cache_clear()


def test_resolve_model_falls_back(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("AI_LIGHTWEIGHT_MODEL", "")
    monkeypatch.setenv("AI_FALLBACK_MODEL", "fallback/model")
    monkeypatch.setenv("AI_PRIMARY_MODEL", "primary/model")
    get_settings.cache_clear()

    result = news_relevance._resolve_model()
    assert result == "fallback/model"
    get_settings.cache_clear()


def test_resolve_model_empty_returns_primary(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("AI_LIGHTWEIGHT_MODEL", "")
    monkeypatch.setenv("AI_FALLBACK_MODEL", "")
    monkeypatch.setenv("AI_PRIMARY_MODEL", "primary/model")
    get_settings.cache_clear()

    result = news_relevance._resolve_model()
    assert result == "primary/model"
    get_settings.cache_clear()

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

# Load .env into os.environ so LiteLLM and other libs can read API keys directly
load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    # Infrastructure
    database_url: str = "postgresql+asyncpg://aiquant:aiquant@db:5432/ai_quant"
    db_pool_size: int = 5
    db_pool_max_overflow: int = 5
    redis_url: str = ""
    cors_origins: str = "http://localhost:3000"
    data_retention_days: int = 90

    # AI Models (primary OpenAI paid path; Gemini free tier as fallback)
    ai_primary_model: str = "gpt-4o"
    ai_fallback_model: str = "gemini/gemini-2.5-flash"
    ai_fast_model: str = "gpt-4o-mini"
    ai_max_analyses_per_day: int = 10
    # Comma-separated trading-pair symbols that the scheduler runs the AI on
    # *in addition to* the market-wide pass. Empty = market-only (legacy).
    ai_analysis_symbols: str = ""

    # Data sources
    binance_api_key: str = ""
    binance_api_secret: str = ""
    # CEX OHLCV collector: comma-separated (ccxt symbol format, e.g. BTC/USDT)
    cex_default_symbols: str = "BTC/USDT,ETH/USDT,BTC/USDC,ETH/USDC,SOL/USDT,BNB/USDT"
    # CoinGecko market overview: comma-separated CoinGecko coin IDs
    coingecko_coin_ids: str = "bitcoin,ethereum,solana,binancecoin,ripple,cardano,dogecoin,tron,chainlink,hyperliquid"
    cex_default_timeframes: str = "1h,4h,1d"
    # NewsAPI.org (developer free tier: 100 req/day, 24h-delayed articles)
    # Used as a slow mainstream-media sentiment source. Leave empty to disable.
    newsapi_key: str = ""
    newsapi_query: str = "bitcoin OR ethereum OR crypto OR cryptocurrency"
    newsapi_language: str = "en"

    # Scheduling
    collect_interval_minutes: int = 30
    news_collect_interval_minutes: int = 15
    # NewsAPI runs on hour-level cadence to stay well under the 100/day quota.
    newsapi_collect_interval_hours: int = 12
    analysis_interval_hours: int = 4
    news_sentiment_interval_minutes: int = 30
    news_sentiment_batch_size: int = 30
    scheduler_job_timeout_seconds: int = 120

    # Network defaults
    http_timeout_default: int = 15
    http_max_retries: int = 3

    # Database
    db_pool_recycle_seconds: int = 300

    # Cache
    cache_default_ttl_seconds: int = 600

    # Binance Futures
    binance_futures_base_url: str = "https://fapi.binance.com"
    binance_futures_symbols: str = "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT"
    binance_rate_limit_delay: float = 0.2

    # Binance WebSocket
    binance_ws_base_url: str = "wss://stream.binance.com:9443/stream"
    binance_ws_timeframes: str = "1m,1h"
    binance_ws_ping_interval: int = 20
    binance_ws_reconnect_delay: int = 5

    # DexScreener
    dexscreener_base_url: str = "https://api.dexscreener.com"
    dexscreener_search_queries: str = "WETH USDC,WBTC USDC,SOL USDC,PEPE WETH,ARB WETH"

    # Fear & Greed
    fear_greed_api_url: str = "https://api.alternative.me/fng/?limit=1&format=json"
    fear_greed_cache_ttl: int = 3600

    # News RSS feeds (comma-separated "name|url" pairs)
    news_rss_feeds: str = "coindesk|https://www.coindesk.com/arc/outboundfeeds/rss/,cointelegraph|https://cointelegraph.com/rss,theblock|https://www.theblock.co/rss.xml,decrypt|https://decrypt.co/feed,bitcoinmagazine|https://bitcoinmagazine.com/feed,newsbtc|https://www.newsbtc.com/feed/,cryptoslate|https://cryptoslate.com/feed/,beincrypto|https://beincrypto.com/feed/"

    # Market overview pairs (ccxt format, comma-separated)
    market_overview_pairs: str = "BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT"

    # Accuracy tracker
    accuracy_eval_window_hours: int = 24

    # Scheduler intervals (supplements existing fields)
    fear_greed_interval_hours: int = 1
    accuracy_interval_hours: int = 6
    data_retention_interval_hours: int = 24

    # Alerting
    alert_enabled: bool = True
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    alert_webhook_url: str = ""
    alert_price_change_pct: float = 5.0
    alert_sentiment_delta: int = 30
    alert_cooldown_minutes: int = 30

    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()

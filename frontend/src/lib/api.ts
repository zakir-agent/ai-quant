import { getApiBase } from "@/lib/backend-url";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetry = (error: unknown, status?: number) => {
  if (typeof status === "number") {
    return status >= 500 || status === 429;
  }
  return error instanceof Error && error.name === "AbortError";
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const retryable = method === "GET";
  const maxAttempts = retryable ? DEFAULT_RETRIES + 1 : 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(`${getApiBase()}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });

      if (!res.ok) {
        const error = new Error(`API error: ${res.status} ${res.statusText}`);
        if (attempt < maxAttempts && shouldRetry(error, res.status)) {
          await sleep(200 * 2 ** (attempt - 1));
          continue;
        }
        throw error;
      }

      return res.json();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && shouldRetry(error)) {
        await sleep(200 * 2 ** (attempt - 1));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown API error");
}

// Health
export interface HealthCheck {
  status: string;
  checks: { api: string; database: string; cache: string };
}
export const getHealth = () => apiFetch<HealthCheck>("/health");

// Market Overview
export interface CoinOverview {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  price_change_24h: number | null;
  price_change_7d: number | null;
  price_change_1h: number | null;
  image: string | null;
}
export const getMarketOverview = () =>
  apiFetch<{ coins: CoinOverview[]; cached: boolean }>("/api/market/overview");

// K-line
export interface KlineCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface KlineResponse {
  symbol: string;
  exchange: string;
  timeframe: string;
  data: KlineCandle[];
}
export interface IndicatorSeries {
  [name: string]: { time: number; value: number }[];
}
export interface KlineWithIndicators extends KlineResponse {
  indicators?: IndicatorSeries;
}
export const getKline = (
  symbol: string,
  exchange: string,
  timeframe: string,
  limit = 200,
  indicators?: string,
) => {
  let url = `/api/market/kline?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}&timeframe=${timeframe}&limit=${limit}`;
  if (indicators) url += `&indicators=${indicators}`;
  return apiFetch<KlineWithIndicators>(url);
};

// Trading pairs
export const getPairs = () => apiFetch<{ pairs: Record<string, string[]> }>("/api/market/pairs");

// DEX data
export interface DexPair {
  source: string;
  chain: string;
  dex: string;
  pair: string;
  volume_24h: number;
  price_usd: number;
  liquidity_usd: number;
  txns_24h: number;
}
export const getDexChains = () => apiFetch<{ chains: string[] }>("/api/market/dex/chains");

export const getDexData = (chain?: string) =>
  apiFetch<{ data: DexPair[] }>(`/api/market/dex${chain ? `?chain=${chain}` : ""}`);

// DeFi data
export interface DefiProtocol {
  protocol: string;
  chain: string;
  tvl: number;
  tvl_change_24h: number | null;
  category: string;
}
export const getDefiCategories = () =>
  apiFetch<{ categories: string[] }>("/api/market/defi/categories");

export const getDefiData = (category?: string) =>
  apiFetch<{ data: DefiProtocol[] }>(`/api/market/defi${category ? `?category=${category}` : ""}`);

// Analysis
export interface Recommendation {
  symbol?: string;
  action: string;
  reason: string;
  entry_price?: number | null;
  target_price: number | null;
  stop_loss: number | null;
  confidence: string;
}
export interface AccuracyDetail {
  symbol: string;
  action: string;
  price_at_rec: number;
  price_after_24h: number;
  change_pct: number;
  correct: boolean;
  return_pct: number;
  target_hit: boolean;
  stop_hit: boolean;
}
export interface AccuracyInfo {
  scored: boolean;
  evaluated_at?: string;
  window_hours?: number;
  accuracy_pct: number | null;
  details?: AccuracyDetail[];
}
export interface AnalysisReport {
  id: number;
  scope: string;
  model_used: string;
  prompt_version?: string;
  sentiment_score: number;
  trend: string;
  risk_level: string;
  summary: string;
  key_observations?: string[];
  recommendations: Recommendation[] | null;
  risk_warnings?: string[];
  technical_analysis?: {
    trend_1h: string;
    trend_4h: string;
    trend_1d: string;
    support_levels: number[];
    resistance_levels: number[];
    key_observation: string;
  } | null;
  token_usage: { input: number; output: number; cost_usd: number } | null;
  accuracy?: AccuracyInfo | null;
  created_at: string;
}
export const runAnalysis = (scope = "market") =>
  apiFetch<AnalysisReport>(`/api/analysis/run?scope=${scope}`, { method: "POST" });
export const getLatestAnalysis = (scope = "market") =>
  apiFetch<{ report: AnalysisReport | null }>(`/api/analysis/latest?scope=${scope}`);
export const getAnalysisHistory = (scope = "market", limit = 10) =>
  apiFetch<{ reports: AnalysisReport[] }>(`/api/analysis/history?scope=${scope}&limit=${limit}`);

// News
export interface NewsAnalysisBrief {
  direction: -1 | 0 | 1;
  event_type: string;
  time_horizon: string;
  intensity: number;
  summary_zh: string | null;
  magnitude?: number;
  confidence?: number;
  primary_asset?: string | null;
  is_actionable?: boolean;
}
export interface NewsItem {
  id: number;
  source: string;
  title: string;
  summary: string | null;
  url: string;
  sentiment: string | null;
  published_at: string;
  analysis?: NewsAnalysisBrief | null;
}
export interface NewsSignal {
  asset: string;
  direction: -1 | 0 | 1;
  event_count: number;
  weighted_score: number;
  avg_intensity: number;
}
export type NewsSourceGroup = "all" | "coingecko" | "rss" | "newsapi";
export const getLatestNews = (limit = 20, sourceGroup: NewsSourceGroup = "all", offset = 0) =>
  apiFetch<{ total: number; articles: NewsItem[] }>(
    `/api/news/latest?limit=${limit}&source_group=${sourceGroup}&offset=${offset}`,
  );
export const getNewsSignals = (hours = 24) =>
  apiFetch<{ hours: number; signals: NewsSignal[] }>(`/api/news/signals?hours=${hours}`);
export const getNewsAnalysis = (newsId: number) =>
  apiFetch<{ analysis: Record<string, unknown> | null }>(`/api/news/${newsId}/analysis`);

// Settings
export interface AIConfig {
  primary_model: string;
  fallback_model: string;
  fast_model: string;
  max_analyses_per_day: number;
  has_api_key: boolean;
}

export interface DataSourcesConfig {
  has_binance_key: boolean;
}

export interface ScheduleConfig {
  collect_interval_minutes: number;
  news_collect_interval_minutes: number;
  analysis_interval_hours: number;
}

export interface AlertConfig {
  enabled: boolean;
  telegram_configured: boolean;
  telegram_bot_token_set: boolean;
  telegram_chat_id_masked: string;
  webhook_configured: boolean;
  price_change_pct: number;
  sentiment_delta: number;
  cooldown_minutes: number;
}

export interface AppConfig {
  ai: AIConfig;
  data_sources: DataSourcesConfig;
  schedule: ScheduleConfig;
  alert: AlertConfig;
}

export interface AIUsage {
  analyses_count: number;
  daily_limit: number;
  total_cost_usd: number;
}

export interface CollectorHealth {
  name: string;
  status: string;
  healthy: boolean;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string;
  last_run_at: string | null;
}

export interface SystemStatus {
  data_counts: {
    ohlcv: number;
    dex_pairs: number;
    defi_protocols: number;
    news_articles: number;
    analysis_reports: number;
  };
  last_collection: {
    ohlcv: string | null;
    dex: string | null;
    defi: string | null;
    news: string | null;
    analysis: string | null;
  };
  ai_usage_today: AIUsage;
  database_size: string;
  collector_health?: CollectorHealth[];
}

export interface SchedulerJob {
  id: string;
  name: string;
  next_run: string | null;
}

export interface SchedulerStatus {
  running: boolean;
  jobs: SchedulerJob[];
}

export const getConfig = () => apiFetch<AppConfig>("/api/settings/config");
export const getSystemStatus = () => apiFetch<SystemStatus>("/api/settings/status");
export const getSchedulerStatus = () => apiFetch<SchedulerStatus>("/api/settings/scheduler");
export const sendAlertTest = () =>
  apiFetch<{ sent: boolean; reason?: "sent" | "disabled" | "not_configured" | "failed" }>(
    "/api/settings/alert/test",
    { method: "POST" },
  );

// Telegram outbound message audit log
export interface TelegramLogItem {
  id: number;
  created_at: string;
  event_type: string;
  title: string;
  message_body: string;
  status: "sent" | "failed";
  error_text: string | null;
  telegram_message_id: number | null;
  chat_id_masked: string;
}
export interface TelegramLogPage {
  total: number;
  limit: number;
  offset: number;
  items: TelegramLogItem[];
}
export const getTelegramLogs = (
  params: { limit?: number; offset?: number; status?: "sent" | "failed"; eventType?: string } = {},
) => {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 20));
  search.set("offset", String(params.offset ?? 0));
  if (params.status) search.set("status", params.status);
  if (params.eventType) search.set("event_type", params.eventType);
  return apiFetch<TelegramLogPage>(`/api/settings/telegram-logs?${search.toString()}`);
};

// Data integrity
export interface DataIntegrity {
  symbol: string;
  exchange: string;
  timeframe: string;
  days: number;
  expected_candles: number;
  actual_candles: number;
  completeness_pct: number;
  gaps: { from: string; to: string; missing_candles: number; gap_hours: number }[];
  gap_count: number;
}
export const getDataIntegrity = (symbol = "BTC/USDT", timeframe = "1h", days = 7) =>
  apiFetch<DataIntegrity>(
    `/api/market/integrity?symbol=${symbol}&timeframe=${timeframe}&days=${days}`,
  );

export interface DataIntegrityCell {
  symbol: string;
  exchange: string;
  timeframe: string;
  days: number;
  expected_candles: number;
  actual_candles: number;
  completeness_pct: number;
  gap_count: number;
}

export interface DataIntegritySummary {
  days: number;
  timeframes: string[];
  cells: DataIntegrityCell[];
  summary: {
    total: number;
    healthy: number;
    warning: number;
    danger: number;
    total_gaps: number;
  };
  generated_at: string;
}

export const getDataIntegritySummary = (days = 7, timeframes = "1h,4h,1d") =>
  apiFetch<DataIntegritySummary>(
    `/api/market/integrity/summary?days=${days}&timeframes=${encodeURIComponent(timeframes)}`,
  );

// Manual collection (async job)
export interface CollectionJobAccepted {
  job_id: string;
  status: "accepted";
}

export interface CollectionJobStatus {
  job_id: string;
  status: "accepted" | "running" | "completed" | "failed";
  started_at: string | null;
  finished_at: string | null;
  results: Record<string, { status: string; records?: number; error?: string }> | null;
  error: string | null;
}

export const triggerCollection = () =>
  apiFetch<CollectionJobAccepted>("/api/market/collect", { method: "POST" });

export const getCollectionJob = (jobId: string) =>
  apiFetch<CollectionJobStatus>(`/api/market/collect/${encodeURIComponent(jobId)}`);

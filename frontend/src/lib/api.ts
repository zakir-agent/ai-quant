const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
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
export const getKline = (symbol: string, exchange: string, timeframe: string, limit = 200) =>
  apiFetch<KlineResponse>(
    `/api/market/kline?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}&timeframe=${timeframe}&limit=${limit}`
  );

// Trading pairs
export const getPairs = () => apiFetch<{ pairs: Record<string, string[]> }>("/api/market/pairs");

// DEX data
export interface DexPair {
  chain: string;
  dex: string;
  pair: string;
  volume_24h: number;
  price_usd: number;
  liquidity_usd: number;
  txns_24h: number;
}
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
export interface AnalysisReport {
  id: number;
  scope: string;
  model_used: string;
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
  created_at: string;
}
export const runAnalysis = (scope = "market") =>
  apiFetch<AnalysisReport>(`/api/analysis/run?scope=${scope}`, { method: "POST" });
export const getLatestAnalysis = (scope = "market") =>
  apiFetch<{ report: AnalysisReport | null }>(`/api/analysis/latest?scope=${scope}`);
export const getAnalysisHistory = (scope = "market", limit = 10) =>
  apiFetch<{ reports: AnalysisReport[] }>(`/api/analysis/history?scope=${scope}&limit=${limit}`);

// News
export interface NewsItem {
  id: number;
  source: string;
  title: string;
  summary: string | null;
  url: string;
  sentiment: string | null;
  published_at: string;
}
export const getLatestNews = (limit = 20) =>
  apiFetch<{ articles: NewsItem[] }>(`/api/news/latest?limit=${limit}`);

// Settings
export const getConfig = () => apiFetch<Record<string, unknown>>("/api/settings/config");
export const getSystemStatus = () => apiFetch<Record<string, unknown>>("/api/settings/status");
export const getSchedulerStatus = () => apiFetch<Record<string, unknown>>("/api/settings/scheduler");

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
  apiFetch<DataIntegrity>(`/api/market/integrity?symbol=${symbol}&timeframe=${timeframe}&days=${days}`);

// Trigger collection
export const triggerCollection = () => apiFetch<Record<string, unknown>>("/api/market/collect", { method: "POST" });

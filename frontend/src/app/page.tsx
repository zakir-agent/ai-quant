"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Database, Wifi, WifiOff } from "lucide-react";
import {
  getHealth,
  getMarketOverview,
  getKline,
  getPairs,
  getDexData,
  getDefiData,
  getLatestAnalysis,
  getLatestNews,
  triggerCollection,
  type HealthCheck,
  type CoinOverview,
  type KlineCandle,
  type DexPair,
  type DefiProtocol,
  type AnalysisReport,
  type NewsItem,
} from "@/lib/api";
import { toast } from "sonner";
import { useT } from "@/components/LanguageProvider";
import { useWebSocket } from "@/lib/websocket";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ErrorBlock from "@/components/ui/ErrorBlock";
import KlineChart from "@/components/charts/KlineChart";
import MarketOverview from "@/components/dashboard/MarketOverview";
import DexPanel from "@/components/dashboard/DexPanel";
import DefiPanel from "@/components/dashboard/DefiPanel";
import AnalysisPanel from "@/components/dashboard/AnalysisPanel";
import NewsPanel from "@/components/dashboard/NewsPanel";

export default function Dashboard() {
  const t = useT();

  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [coins, setCoins] = useState<CoinOverview[]>([]);
  const [klineData, setKlineData] = useState<KlineCandle[]>([]);
  const [klineIndicators, setKlineIndicators] = useState<Record<string, { time: number; value: number }[]>>({});
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(["ma"]));
  const [pairs, setPairs] = useState<Record<string, string[]>>({});
  const [selectedSymbol, setSelectedSymbol] = useState("BTC/USDT");
  const [selectedExchange, setSelectedExchange] = useState("binance");
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
  const [dexPairs, setDexPairs] = useState<DexPair[]>([]);
  const [defiProtocols, setDefiProtocols] = useState<DefiProtocol[]>([]);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, { price: number; change_pct: number }>>({});

  // WebSocket for real-time data
  const wsChannels = useMemo(() => [
    `kline:${selectedSymbol}:1m`,
    `kline:${selectedSymbol}:${selectedTimeframe}`,
    "ticker:BTC/USDT",
    "ticker:ETH/USDT",
    "ticker:SOL/USDT",
    "ticker:BNB/USDT",
  ], [selectedSymbol, selectedTimeframe]);

  const klineDataRef = useRef(klineData);
  klineDataRef.current = klineData;

  const handleWsMessage = useCallback((data: Record<string, unknown>) => {
    if (data.type === "ticker") {
      const sym = data.symbol as string;
      setLivePrices((prev) => ({
        ...prev,
        [sym]: { price: data.price as number, change_pct: data.change_pct as number },
      }));
    } else if (data.type === "kline") {
      const candle = data.candle as KlineCandle & { closed: boolean };
      const tf = data.timeframe as string;
      if (tf === selectedTimeframe && data.symbol === selectedSymbol) {
        // Update or append the latest candle
        setKlineData((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (candle.time === last.time) {
            // Update existing candle
            return [...prev.slice(0, -1), { time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume }];
          } else if (candle.time > last.time && candle.closed) {
            // New closed candle — append
            return [...prev.slice(1), { time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume }];
          }
          return prev;
        });
      }
    }
  }, [selectedTimeframe, selectedSymbol]);

  const { connected: wsConnected } = useWebSocket({
    channels: wsChannels,
    onMessage: handleWsMessage,
  });

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [h, overview, pairsData, dex, defi, analysis, newsData] = await Promise.all([
        getHealth(),
        getMarketOverview(),
        getPairs(),
        getDexData(),
        getDefiData(),
        getLatestAnalysis(),
        getLatestNews(),
      ]);
      setHealth(h);
      setCoins(overview.coins);
      setPairs(pairsData.pairs);
      setDexPairs(dex.data);
      setDefiProtocols(defi.data);
      setAnalysisReport(analysis.report);
      setNews(newsData.articles);
    } catch {
      setError("loadFailed");
    }
  }, []);

  const indicatorParam = [...activeIndicators].join(",");
  const loadKline = useCallback(async () => {
    try {
      const kline = await getKline(selectedSymbol, selectedExchange, selectedTimeframe, 200, indicatorParam || undefined);
      setKlineData(kline.data);
      setKlineIndicators(kline.indicators || {});
    } catch {
      // K-line failure is non-critical on dashboard
    }
  }, [selectedSymbol, selectedExchange, selectedTimeframe, indicatorParam]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadKline();
  }, [loadKline]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      await triggerCollection();
      toast.success(t("common.collectDone"));
      await loadData();
      await loadKline();
    } catch {
      toast.error(t("common.collectFail"));
    } finally {
      setCollecting(false);
    }
  };

  const availableSymbols = pairs[selectedExchange] || [];
  const timeframes = ["1h", "4h", "1d"];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0 }}
        className="flex items-center justify-between"
      >
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("dashboard.title")}</h2>
        <div className="flex items-center gap-3">
          <Badge variant={wsConnected ? "success" : "warning"}>
            <span className="flex items-center gap-1.5">
              {wsConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {wsConnected ? "LIVE" : "OFF"}
            </span>
          </Badge>
          {health && (
            <Badge variant={health.status === "ok" ? "success" : "danger"}>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: health.status === "ok" ? "var(--success)" : "var(--danger)",
                  }}
                />
                {health.status === "ok" ? "OK" : "ERR"}
              </span>
            </Badge>
          )}
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: collecting ? "var(--text-muted)" : "var(--accent-primary)",
            }}
          >
            <span className="flex items-center gap-2">
              <Database size={14} />
              {collecting ? t("common.collecting") : t("common.collect")}
            </span>
          </button>
        </div>
      </motion.div>

      {error && (
        <ErrorBlock
          message={t(`common.${error}`)}
          onRetry={loadData}
          retryLabel={t("common.retry")}
        />
      )}

      {/* K-Line Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card title={t("dashboard.kline")}>
          <div className="mb-4 flex items-center gap-4">
            {/* Exchange selector */}
            <select
              value={selectedExchange}
              onChange={(e) => {
                setSelectedExchange(e.target.value);
                const firstPair = pairs[e.target.value]?.[0];
                if (firstPair) setSelectedSymbol(firstPair);
              }}
              className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1 text-sm text-[var(--text-primary)]"
            >
              {Object.keys(pairs).length > 0 ? (
                Object.keys(pairs).map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))
              ) : (
                <option value="binance">binance</option>
              )}
            </select>

            {/* Symbol selector */}
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1 text-sm text-[var(--text-primary)]"
            >
              {availableSymbols.length > 0 ? (
                availableSymbols.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))
              ) : (
                <option value="BTC/USDT">BTC/USDT</option>
              )}
            </select>

            {/* Timeframe selector */}
            <div className="flex gap-1">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className="rounded px-3 py-1 text-xs transition-colors"
                  style={{
                    backgroundColor:
                      selectedTimeframe === tf ? "var(--accent-primary)" : "var(--bg-secondary)",
                    color: selectedTimeframe === tf ? "#fff" : "var(--text-muted)",
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Indicator toggles */}
            <div className="flex gap-1">
              {(["ma", "bollinger", "rsi", "macd"] as const).map((ind) => (
                <button
                  key={ind}
                  onClick={() => {
                    setActiveIndicators((prev) => {
                      const next = new Set(prev);
                      if (next.has(ind)) next.delete(ind);
                      else next.add(ind);
                      return next;
                    });
                  }}
                  className="rounded px-2 py-1 text-xs transition-colors"
                  style={{
                    backgroundColor: activeIndicators.has(ind) ? "var(--accent-secondary, var(--accent-primary))" : "var(--bg-secondary)",
                    color: activeIndicators.has(ind) ? "#fff" : "var(--text-muted)",
                    opacity: activeIndicators.has(ind) ? 1 : 0.6,
                  }}
                >
                  {ind.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {klineData.length > 0 ? (
            <KlineChart data={klineData} symbol={selectedSymbol} indicators={klineIndicators} activeIndicators={activeIndicators} />
          ) : (
            <div className="flex h-[400px] items-center justify-center text-[var(--text-muted)]">
              {t("dashboard.noKline")}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Market Overview + AI Analysis */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card title={t("dashboard.marketOverview")} className="lg:h-[480px]">
            <MarketOverview coins={coins} livePrices={livePrices} />
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card title={t("dashboard.aiAnalysis")} className="lg:h-[480px]">
            <AnalysisPanel report={analysisReport} onRefresh={loadData} />
          </Card>
        </motion.div>
      </div>

      {/* DEX Hot Pairs + News */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card title={t("dashboard.dexHot")} className="lg:h-[480px]">
            <DexPanel pairs={dexPairs} />
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card title={t("dashboard.news")} className="lg:h-[480px]">
            <NewsPanel articles={news} />
          </Card>
        </motion.div>
      </div>

      {/* DeFi TVL - Full width */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card title={t("dashboard.defiTvl")}>
          <DefiPanel protocols={defiProtocols} />
        </Card>
      </motion.div>
    </div>
  );
}

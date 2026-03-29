"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Database } from "lucide-react";
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
import { useT } from "@/components/LanguageProvider";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
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
  const [pairs, setPairs] = useState<Record<string, string[]>>({});
  const [selectedSymbol, setSelectedSymbol] = useState("BTC/USDT");
  const [selectedExchange, setSelectedExchange] = useState("binance");
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
  const [dexPairs, setDexPairs] = useState<DexPair[]>([]);
  const [defiProtocols, setDefiProtocols] = useState<DefiProtocol[]>([]);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [collectResult, setCollectResult] = useState<string | null>(null);

  const loadData = useCallback(async () => {
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
    } catch (e) {
      console.error("Failed to load data:", e);
    }
  }, []);

  const loadKline = useCallback(async () => {
    try {
      const kline = await getKline(selectedSymbol, selectedExchange, selectedTimeframe);
      setKlineData(kline.data);
    } catch (e) {
      console.error("Failed to load kline:", e);
    }
  }, [selectedSymbol, selectedExchange, selectedTimeframe]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadKline();
  }, [loadKline]);

  const handleCollect = async () => {
    setCollecting(true);
    setCollectResult(null);
    try {
      await triggerCollection();
      setCollectResult(t("common.collectDone"));
      // Reload data after collection
      await loadData();
      await loadKline();
    } catch (e) {
      setCollectResult(t("common.collectFail") + ": " + (e as Error).message);
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

      {collectResult && (
        <div
          className="rounded-lg px-4 py-2 text-sm"
          style={{
            backgroundColor: collectResult.includes(":")
              ? "color-mix(in srgb, var(--danger) 15%, transparent)"
              : "color-mix(in srgb, var(--success) 15%, transparent)",
            color: collectResult.includes(":") ? "var(--danger)" : "var(--success)",
          }}
        >
          {collectResult}
        </div>
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
          </div>

          {klineData.length > 0 ? (
            <KlineChart data={klineData} symbol={selectedSymbol} />
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
            <MarketOverview coins={coins} />
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

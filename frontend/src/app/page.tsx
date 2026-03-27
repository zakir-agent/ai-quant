"use client";

import { useEffect, useState, useCallback } from "react";
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
import KlineChart from "@/components/charts/KlineChart";
import MarketOverview from "@/components/dashboard/MarketOverview";
import DexPanel from "@/components/dashboard/DexPanel";
import DefiPanel from "@/components/dashboard/DefiPanel";
import AnalysisPanel from "@/components/dashboard/AnalysisPanel";
import NewsPanel from "@/components/dashboard/NewsPanel";

export default function Dashboard() {
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
      const result = await triggerCollection();
      setCollectResult("采集完成");
      // Reload data after collection
      await loadData();
      await loadKline();
    } catch (e) {
      setCollectResult("采集失败: " + (e as Error).message);
    } finally {
      setCollecting(false);
    }
  };

  const availableSymbols = pairs[selectedExchange] || [];
  const timeframes = ["1h", "4h", "1d"];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">仪表盘</h2>
        <div className="flex items-center gap-3">
          {health && (
            <span
              className={`text-xs px-2 py-1 rounded ${
                health.status === "ok"
                  ? "bg-green-900/50 text-green-400"
                  : "bg-red-900/50 text-red-400"
              }`}
            >
              {health.status === "ok" ? "系统正常" : "系统异常"}
            </span>
          )}
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 rounded-lg transition-colors"
          >
            {collecting ? "采集中..." : "手动采集"}
          </button>
        </div>
      </div>

      {collectResult && (
        <div className={`text-sm px-4 py-2 rounded ${collectResult.includes("失败") ? "bg-red-900/30 text-red-400" : "bg-green-900/30 text-green-400"}`}>
          {collectResult}
        </div>
      )}

      {/* K-line Section */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <div className="flex items-center gap-4 mb-4">
          <h3 className="text-lg font-semibold">K 线图</h3>

          {/* Exchange selector */}
          <select
            value={selectedExchange}
            onChange={(e) => {
              setSelectedExchange(e.target.value);
              const firstPair = pairs[e.target.value]?.[0];
              if (firstPair) setSelectedSymbol(firstPair);
            }}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          >
            {Object.keys(pairs).length > 0 ? (
              Object.keys(pairs).map((ex) => (
                <option key={ex} value={ex}>{ex}</option>
              ))
            ) : (
              <option value="binance">binance</option>
            )}
          </select>

          {/* Symbol selector */}
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          >
            {availableSymbols.length > 0 ? (
              availableSymbols.map((s) => (
                <option key={s} value={s}>{s}</option>
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
                className={`px-3 py-1 text-xs rounded ${
                  selectedTimeframe === tf
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {klineData.length > 0 ? (
          <KlineChart data={klineData} symbol={selectedSymbol} />
        ) : (
          <div className="h-[400px] flex items-center justify-center text-gray-500">
            暂无 K 线数据 — 点击"手动采集"获取数据
          </div>
        )}
      </div>

      {/* Market Overview */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h3 className="text-lg font-semibold mb-4">市场概览</h3>
        <MarketOverview coins={coins} />
      </div>

      {/* DEX + DeFi */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h3 className="text-lg font-semibold mb-4">DEX 热门交易对</h3>
          <DexPanel pairs={dexPairs} />
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h3 className="text-lg font-semibold mb-4">DeFi 协议 TVL 排名</h3>
          <DefiPanel protocols={defiProtocols} />
        </div>
      </div>

      {/* AI Analysis */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h3 className="text-lg font-semibold mb-4">AI 市场分析</h3>
        <AnalysisPanel report={analysisReport} onRefresh={loadData} />
      </div>

      {/* News */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h3 className="text-lg font-semibold mb-4">新闻动态</h3>
        <NewsPanel articles={news} />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getKline,
  getPairs,
  getDexData,
  getDefiData,
  getMarketOverview,
  type KlineCandle,
  type DexPair,
  type DefiProtocol,
  type CoinOverview,
} from "@/lib/api";
import KlineChart from "@/components/charts/KlineChart";
import MarketOverview from "@/components/dashboard/MarketOverview";
import DexPanel from "@/components/dashboard/DexPanel";
import DefiPanel from "@/components/dashboard/DefiPanel";

type Tab = "kline" | "overview" | "dex" | "defi";

export default function MarketPage() {
  const [tab, setTab] = useState<Tab>("kline");
  const [pairs, setPairs] = useState<Record<string, string[]>>({});
  const [selectedSymbol, setSelectedSymbol] = useState("BTC/USDT");
  const [selectedExchange, setSelectedExchange] = useState("binance");
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
  const [klineData, setKlineData] = useState<KlineCandle[]>([]);
  const [coins, setCoins] = useState<CoinOverview[]>([]);
  const [dexPairs, setDexPairs] = useState<DexPair[]>([]);
  const [defiProtocols, setDefiProtocols] = useState<DefiProtocol[]>([]);
  const [dexChainFilter, setDexChainFilter] = useState<string>("");
  const [defiCategoryFilter, setDefiCategoryFilter] = useState<string>("");

  useEffect(() => {
    getPairs().then((r) => setPairs(r.pairs));
  }, []);

  const loadKline = useCallback(async () => {
    const kline = await getKline(selectedSymbol, selectedExchange, selectedTimeframe, 500);
    setKlineData(kline.data);
  }, [selectedSymbol, selectedExchange, selectedTimeframe]);

  useEffect(() => {
    if (tab === "kline") loadKline();
  }, [tab, loadKline]);

  useEffect(() => {
    if (tab === "overview") getMarketOverview().then((r) => setCoins(r.coins));
  }, [tab]);

  useEffect(() => {
    if (tab === "dex") getDexData(dexChainFilter || undefined).then((r) => setDexPairs(r.data));
  }, [tab, dexChainFilter]);

  useEffect(() => {
    if (tab === "defi") getDefiData(defiCategoryFilter || undefined).then((r) => setDefiProtocols(r.data));
  }, [tab, defiCategoryFilter]);

  const availableSymbols = pairs[selectedExchange] || [];
  const timeframes = ["1h", "4h", "1d"];

  const tabs: { id: Tab; label: string }[] = [
    { id: "kline", label: "K 线图" },
    { id: "overview", label: "市场概览" },
    { id: "dex", label: "DEX 数据" },
    { id: "defi", label: "DeFi 数据" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">市场数据</h2>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm rounded-t transition-colors ${
              tab === t.id ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* K-line tab */}
      {tab === "kline" && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <select
              value={selectedExchange}
              onChange={(e) => {
                setSelectedExchange(e.target.value);
                const first = pairs[e.target.value]?.[0];
                if (first) setSelectedSymbol(first);
              }}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
            >
              {Object.keys(pairs).map((ex) => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
            >
              {availableSymbols.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
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
            <div className="h-[400px] flex items-center justify-center text-gray-500">暂无数据</div>
          )}
        </div>
      )}

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <MarketOverview coins={coins} />
        </div>
      )}

      {/* DEX tab */}
      {tab === "dex" && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="mb-4">
            <select
              value={dexChainFilter}
              onChange={(e) => setDexChainFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
            >
              <option value="">全部链</option>
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
              <option value="bsc">BSC</option>
              <option value="base">Base</option>
              <option value="arbitrum">Arbitrum</option>
            </select>
          </div>
          <DexPanel pairs={dexPairs} />
        </div>
      )}

      {/* DeFi tab */}
      {tab === "defi" && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="mb-4">
            <select
              value={defiCategoryFilter}
              onChange={(e) => setDefiCategoryFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
            >
              <option value="">全部分类</option>
              <option value="lending">Lending</option>
              <option value="dex">DEX</option>
              <option value="liquid-staking">Liquid Staking</option>
              <option value="yield">Yield</option>
              <option value="cdp">CDP</option>
            </select>
          </div>
          <DefiPanel protocols={defiProtocols} />
        </div>
      )}
    </div>
  );
}

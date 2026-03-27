"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
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
import Card from "@/components/ui/Card";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useT } from "@/components/LanguageProvider";

type Tab = "kline" | "overview" | "dex" | "defi";

export default function MarketPage() {
  const t = useT();
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
    getPairs().then((r) => setPairs(r.pairs)).catch(() => {});
  }, []);

  const loadKline = useCallback(async () => {
    try {
      const kline = await getKline(selectedSymbol, selectedExchange, selectedTimeframe, 500);
      setKlineData(kline.data);
    } catch (e) {
      console.error("Failed to load kline:", e);
    }
  }, [selectedSymbol, selectedExchange, selectedTimeframe]);

  useEffect(() => {
    if (tab === "kline") void loadKline(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [tab, loadKline]);

  useEffect(() => {
    if (tab === "overview") getMarketOverview().then((r) => setCoins(r.coins)).catch(() => {});
  }, [tab]);

  useEffect(() => {
    if (tab === "dex") getDexData(dexChainFilter || undefined).then((r) => setDexPairs(r.data)).catch(() => {});
  }, [tab, dexChainFilter]);

  useEffect(() => {
    if (tab === "defi") getDefiData(defiCategoryFilter || undefined).then((r) => setDefiProtocols(r.data)).catch(() => {});
  }, [tab, defiCategoryFilter]);

  const availableSymbols = pairs[selectedExchange] || [];
  const timeframes = ["1h", "4h", "1d"];

  const tabOptions: { value: Tab; label: string }[] = [
    { value: "kline", label: t("market.klineTab") },
    { value: "overview", label: t("market.overviewTab") },
    { value: "dex", label: t("market.dexTab") },
    { value: "defi", label: t("market.defiTab") },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("market.title")}</h2>

      <SegmentedControl options={tabOptions} value={tab} onChange={setTab} />

      {/* K-line tab */}
      {tab === "kline" && (
        <motion.div key="kline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <Card>
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <select
                value={selectedExchange}
                onChange={(e) => {
                  setSelectedExchange(e.target.value);
                  const first = pairs[e.target.value]?.[0];
                  if (first) setSelectedSymbol(first);
                }}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] rounded px-2 py-1 text-sm"
              >
                {Object.keys(pairs).map((ex) => (
                  <option key={ex} value={ex}>{ex}</option>
                ))}
              </select>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] rounded px-2 py-1 text-sm"
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
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      selectedTimeframe === tf
                        ? "bg-[var(--accent-primary)] text-white"
                        : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
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
              <div className="h-[400px] flex items-center justify-center text-[var(--text-muted)]">
                {t("common.noData")}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* Overview tab */}
      {tab === "overview" && (
        <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <Card>
            <MarketOverview coins={coins} />
          </Card>
        </motion.div>
      )}

      {/* DEX tab */}
      {tab === "dex" && (
        <motion.div key="dex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <Card>
            <div className="mb-4">
              <select
                value={dexChainFilter}
                onChange={(e) => setDexChainFilter(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] rounded px-2 py-1 text-sm"
              >
                <option value="">{t("market.allChains")}</option>
                <option value="ethereum">Ethereum</option>
                <option value="solana">Solana</option>
                <option value="bsc">BSC</option>
                <option value="base">Base</option>
                <option value="arbitrum">Arbitrum</option>
              </select>
            </div>
            <DexPanel pairs={dexPairs} />
          </Card>
        </motion.div>
      )}

      {/* DeFi tab */}
      {tab === "defi" && (
        <motion.div key="defi" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <Card>
            <div className="mb-4">
              <select
                value={defiCategoryFilter}
                onChange={(e) => setDefiCategoryFilter(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] rounded px-2 py-1 text-sm"
              >
                <option value="">{t("market.allCategories")}</option>
                <option value="lending">Lending</option>
                <option value="dex">DEX</option>
                <option value="liquid-staking">Liquid Staking</option>
                <option value="yield">Yield</option>
                <option value="cdp">CDP</option>
              </select>
            </div>
            <DefiPanel protocols={defiProtocols} />
          </Card>
        </motion.div>
      )}
    </div>
  );
}

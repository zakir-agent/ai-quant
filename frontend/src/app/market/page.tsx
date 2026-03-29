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
import ErrorBlock from "@/components/ui/ErrorBlock";
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
  const [klineIndicators, setKlineIndicators] = useState<Record<string, { time: number; value: number }[]>>({});
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(["ma"]));
  const [coins, setCoins] = useState<CoinOverview[]>([]);
  const [dexPairs, setDexPairs] = useState<DexPair[]>([]);
  const [defiProtocols, setDefiProtocols] = useState<DefiProtocol[]>([]);
  const [dexChainFilter, setDexChainFilter] = useState<string>("");
  const [defiCategoryFilter, setDefiCategoryFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPairs()
      .then((r) => setPairs(r.pairs))
      .catch(() => {});
  }, []);

  const indicatorParam = [...activeIndicators].join(",");
  const loadKline = useCallback(async () => {
    setError(null);
    try {
      const kline = await getKline(selectedSymbol, selectedExchange, selectedTimeframe, 500, indicatorParam || undefined);
      setKlineData(kline.data);
      setKlineIndicators(kline.indicators || {});
    } catch {
      setError("kline");
    }
  }, [selectedSymbol, selectedExchange, selectedTimeframe, indicatorParam]);

  useEffect(() => {
    if (tab === "kline") void loadKline(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [tab, loadKline]);

  const loadOverview = useCallback(async () => {
    setError(null);
    try {
      const r = await getMarketOverview();
      setCoins(r.coins);
    } catch {
      setError("overview");
    }
  }, []);

  const loadDex = useCallback(async () => {
    setError(null);
    try {
      const r = await getDexData(dexChainFilter || undefined);
      setDexPairs(r.data);
    } catch {
      setError("dex");
    }
  }, [dexChainFilter]);

  const loadDefi = useCallback(async () => {
    setError(null);
    try {
      const r = await getDefiData(defiCategoryFilter || undefined);
      setDefiProtocols(r.data);
    } catch {
      setError("defi");
    }
  }, [defiCategoryFilter]);

  useEffect(() => {
    if (tab === "overview") void loadOverview(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [tab, loadOverview]);

  useEffect(() => {
    if (tab === "dex") void loadDex(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [tab, loadDex]);

  useEffect(() => {
    if (tab === "defi") void loadDefi(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [tab, loadDefi]);

  const availableSymbols = pairs[selectedExchange] || [];
  const timeframes = ["1h", "4h", "1d"];

  const tabOptions: { value: Tab; label: string }[] = [
    { value: "kline", label: t("market.klineTab") },
    { value: "overview", label: t("market.overviewTab") },
    { value: "dex", label: t("market.dexTab") },
    { value: "defi", label: t("market.defiTab") },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("market.title")}</h2>

      <SegmentedControl options={tabOptions} value={tab} onChange={setTab} />

      {error && (
        <ErrorBlock
          message={t("common.loadFailed")}
          onRetry={() => {
            if (error === "kline") loadKline();
            else if (error === "overview") loadOverview();
            else if (error === "dex") loadDex();
            else if (error === "defi") loadDefi();
          }}
          retryLabel={t("common.retry")}
        />
      )}

      {/* K-line tab */}
      {tab === "kline" && (
        <motion.div
          key="kline"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <select
                value={selectedExchange}
                onChange={(e) => {
                  setSelectedExchange(e.target.value);
                  const first = pairs[e.target.value]?.[0];
                  if (first) setSelectedSymbol(first);
                }}
                className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1 text-sm text-[var(--text-primary)]"
              >
                {Object.keys(pairs).map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1 text-sm text-[var(--text-primary)]"
              >
                {availableSymbols.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                {timeframes.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`rounded px-3 py-1 text-xs transition-colors ${
                      selectedTimeframe === tf
                        ? "bg-[var(--accent-primary)] text-white"
                        : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
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
                {t("common.noData")}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* Overview tab */}
      {tab === "overview" && (
        <motion.div
          key="overview"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <MarketOverview coins={coins} />
          </Card>
        </motion.div>
      )}

      {/* DEX tab */}
      {tab === "dex" && (
        <motion.div
          key="dex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <div className="mb-4">
              <select
                value={dexChainFilter}
                onChange={(e) => setDexChainFilter(e.target.value)}
                className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1 text-sm text-[var(--text-primary)]"
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
        <motion.div
          key="defi"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <div className="mb-4">
              <select
                value={defiCategoryFilter}
                onChange={(e) => setDefiCategoryFilter(e.target.value)}
                className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1 text-sm text-[var(--text-primary)]"
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

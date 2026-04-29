"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  getDexData,
  getDexChains,
  getDefiData,
  getDefiCategories,
  type DexPair,
  type DefiProtocol,
} from "@/lib/api";
import DexPanel from "@/components/dashboard/DexPanel";
import DefiPanel from "@/components/dashboard/DefiPanel";
import Card from "@/components/ui/Card";
import ErrorBlock from "@/components/ui/ErrorBlock";
import { useT } from "@/components/LanguageProvider";

type Tab = "dex" | "defi";

export default function MarketPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("dex");
  const [dexPairs, setDexPairs] = useState<DexPair[]>([]);
  const [defiProtocols, setDefiProtocols] = useState<DefiProtocol[]>([]);
  const [dexChainFilter, setDexChainFilter] = useState<string>("");
  const [dexChains, setDexChains] = useState<string[]>([]);
  const [defiCategoryFilter, setDefiCategoryFilter] = useState<string>("");
  const [defiCategories, setDefiCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDex = useCallback(async () => {
    setError(null);
    try {
      const [r, ch] = await Promise.all([
        getDexData(dexChainFilter || undefined),
        dexChains.length === 0 ? getDexChains() : Promise.resolve(null),
      ]);
      setDexPairs(r.data);
      if (ch) setDexChains(ch.chains);
    } catch {
      setError("dex");
    }
  }, [dexChainFilter, dexChains.length]);

  const loadDefi = useCallback(async () => {
    setError(null);
    try {
      const [r, cats] = await Promise.all([
        getDefiData(defiCategoryFilter || undefined),
        defiCategories.length === 0 ? getDefiCategories() : Promise.resolve(null),
      ]);
      setDefiProtocols(r.data);
      if (cats) setDefiCategories(cats.categories);
    } catch {
      setError("defi");
    }
  }, [defiCategoryFilter, defiCategories.length]);

  useEffect(() => {
    if (tab === "dex") void loadDex(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [tab, loadDex]);

  useEffect(() => {
    if (tab === "defi") void loadDefi(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [tab, loadDefi]);

  const tabOptions: { value: Tab; label: string }[] = [
    { value: "dex", label: t("market.dexTab") },
    { value: "defi", label: t("market.defiTab") },
  ];

  const selectClass =
    "appearance-none rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-1.5 pr-8 text-sm text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-hover)] focus:border-[var(--accent-primary)] bg-[length:16px_16px] bg-[right_6px_center] bg-no-repeat";
  const selectArrow = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none'%3E%3Cpath d='M4 6l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-3 shadow-[var(--card-shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            {tabOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTab(opt.value)}
                className={`relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${
                  tab === opt.value
                    ? "bg-[var(--accent-primary)] text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {tab === "dex" && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
            >
              <select
                value={dexChainFilter}
                onChange={(e) => setDexChainFilter(e.target.value)}
                className={selectClass}
                style={selectArrow}
              >
                <option value="">{t("market.allChains")}</option>
                {dexChains.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch[0].toUpperCase() + ch.slice(1)}
                  </option>
                ))}
              </select>
            </motion.div>
          )}

          {tab === "defi" && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
            >
              <select
                value={defiCategoryFilter}
                onChange={(e) => setDefiCategoryFilter(e.target.value)}
                className={selectClass}
                style={selectArrow}
              >
                <option value="">{t("market.allCategories")}</option>
                {defiCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat
                      .split("-")
                      .map((w) =>
                        w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1),
                      )
                      .join(" ")}
                  </option>
                ))}
              </select>
            </motion.div>
          )}
        </div>
      </div>

      {error && (
        <ErrorBlock
          message={t("common.loadFailed")}
          onRetry={() => {
            if (error === "dex") loadDex();
            else if (error === "defi") loadDefi();
          }}
          retryLabel={t("common.retry")}
        />
      )}

      {tab === "dex" && (
        <motion.div
          key="dex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <DexPanel pairs={dexPairs} />
          </Card>
        </motion.div>
      )}

      {tab === "defi" && (
        <motion.div
          key="defi"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <DefiPanel protocols={defiProtocols} />
          </Card>
        </motion.div>
      )}
    </div>
  );
}

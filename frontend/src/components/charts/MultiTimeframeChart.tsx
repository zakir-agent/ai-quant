"use client";

import { useEffect, useState, useCallback } from "react";
import { getKline, type KlineCandle } from "@/lib/api";
import type { IndicatorSeries } from "@/components/charts/KlineChart";
import KlineChart from "@/components/charts/KlineChart";
import { useT } from "@/components/LanguageProvider";

interface MultiTimeframeChartProps {
  symbol: string;
  exchange: string;
  activeIndicators: Set<string>;
}

interface TimeframeData {
  data: KlineCandle[];
  indicators: IndicatorSeries;
  loading: boolean;
}

const ALL_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const DEFAULT_SELECTED = new Set(["1h", "4h", "1d"]);
const MAX_SELECTED = 3;

export default function MultiTimeframeChart({
  symbol,
  exchange,
  activeIndicators,
}: MultiTimeframeChartProps) {
  const t = useT();
  const [selectedTFs, setSelectedTFs] = useState<Set<string>>(DEFAULT_SELECTED);
  const [frames, setFrames] = useState<Record<string, TimeframeData>>({});

  const indicatorParam = [...activeIndicators].join(",");

  const toggleTF = (tf: string) => {
    setSelectedTFs((prev) => {
      const next = new Set(prev);
      if (next.has(tf)) {
        if (next.size > 1) next.delete(tf);
      } else {
        if (next.size < MAX_SELECTED) next.add(tf);
      }
      return next;
    });
  };

  const selectedArray = ALL_TIMEFRAMES.filter((tf) => selectedTFs.has(tf));

  const loadAll = useCallback(async () => {
    const tfs = ALL_TIMEFRAMES.filter((tf) => selectedTFs.has(tf));
    setFrames((prev) => {
      const next = { ...prev };
      for (const tf of tfs)
        next[tf] = { ...(next[tf] || { data: [], indicators: {} }), loading: true };
      return next;
    });

    const results = await Promise.allSettled(
      tfs.map((tf) => getKline(symbol, exchange, tf, 200, indicatorParam || undefined)),
    );

    setFrames((prev) => {
      const next = { ...prev };
      for (let i = 0; i < tfs.length; i++) {
        const tf = tfs[i];
        const result = results[i];
        if (result.status === "fulfilled") {
          next[tf] = {
            data: result.value.data,
            indicators: result.value.indicators || {},
            loading: false,
          };
        } else {
          next[tf] = { ...(next[tf] || { data: [], indicators: {} }), loading: false };
        }
      }
      return next;
    });
  }, [symbol, exchange, indicatorParam, selectedTFs]);

  useEffect(() => {
    void loadAll(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [loadAll]);

  const gridCols =
    selectedArray.length === 1
      ? "grid-cols-1"
      : selectedArray.length === 2
        ? "grid-cols-1 lg:grid-cols-2"
        : "grid-cols-1 lg:grid-cols-3";

  return (
    <div>
      {/* Timeframe selector */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-[var(--text-muted)]">{t("dashboard.multiChart")}</span>
        {ALL_TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => toggleTF(tf)}
            className="rounded px-2 py-0.5 text-xs font-medium transition-colors"
            style={{
              background: selectedTFs.has(tf) ? "var(--accent-primary)" : "var(--bg-secondary)",
              color: selectedTFs.has(tf) ? "#fff" : "var(--text-muted)",
              border: "1px solid var(--border-primary)",
            }}
          >
            {tf.toUpperCase()}
          </button>
        ))}
        <span className="ml-1 text-[10px] text-[var(--text-muted)]">
          ({selectedArray.length}/{MAX_SELECTED})
        </span>
      </div>

      {/* Charts grid */}
      <div className={`grid gap-4 ${gridCols}`}>
        {selectedArray.map((tf) => {
          const frame = frames[tf] || { data: [], indicators: {}, loading: true };
          return (
            <div key={tf}>
              <div className="mb-1 text-center text-xs font-semibold text-[var(--text-muted)]">
                {symbol} · {tf.toUpperCase()}
              </div>
              {frame.loading ? (
                <div
                  className="flex items-center justify-center text-sm text-[var(--text-muted)]"
                  style={{ height: 300 }}
                >
                  {t("common.loading")}
                </div>
              ) : frame.data.length > 0 ? (
                <KlineChart
                  data={frame.data}
                  symbol={symbol}
                  indicators={frame.indicators}
                  activeIndicators={activeIndicators}
                />
              ) : (
                <div
                  className="flex items-center justify-center text-sm text-[var(--text-muted)]"
                  style={{ height: 300 }}
                >
                  {t("common.noData")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

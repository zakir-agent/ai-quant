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

const TIMEFRAMES = ["1h", "4h", "1d"] as const;

export default function MultiTimeframeChart({
  symbol,
  exchange,
  activeIndicators,
}: MultiTimeframeChartProps) {
  const t = useT();
  const [frames, setFrames] = useState<Record<string, TimeframeData>>({
    "1h": { data: [], indicators: {}, loading: true },
    "4h": { data: [], indicators: {}, loading: true },
    "1d": { data: [], indicators: {}, loading: true },
  });

  const indicatorParam = [...activeIndicators].join(",");

  const loadAll = useCallback(async () => {
    setFrames((prev) => {
      const next = { ...prev };
      for (const tf of TIMEFRAMES) next[tf] = { ...next[tf], loading: true };
      return next;
    });

    const results = await Promise.allSettled(
      TIMEFRAMES.map((tf) => getKline(symbol, exchange, tf, 200, indicatorParam || undefined)),
    );

    setFrames((prev) => {
      const next = { ...prev };
      for (let i = 0; i < TIMEFRAMES.length; i++) {
        const tf = TIMEFRAMES[i];
        const result = results[i];
        if (result.status === "fulfilled") {
          next[tf] = {
            data: result.value.data,
            indicators: result.value.indicators || {},
            loading: false,
          };
        } else {
          next[tf] = { ...next[tf], loading: false };
        }
      }
      return next;
    });
  }, [symbol, exchange, indicatorParam]);

  useEffect(() => {
    void loadAll(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [loadAll]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {TIMEFRAMES.map((tf) => {
        const frame = frames[tf];
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
  );
}

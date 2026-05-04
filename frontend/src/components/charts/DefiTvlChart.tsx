"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { getDefiHistory, type DefiHistorySeries } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { useT } from "@/components/LanguageProvider";

const SERIES_COLORS = ["#3b82f6", "#f59e0b", "#22c55e", "#a855f7", "#ec4899"];
const DAY_OPTIONS = [7, 30, 90] as const;

const themeColors = {
  quantum: { background: "#0B1120", text: "#9ca3af", grid: "#1E293B" },
  neon: { background: "#000000", text: "#a3e635", grid: "#0A1A0A" },
};

interface Props {
  category?: string;
}

export default function DefiTvlChart({ category }: Props) {
  const { theme } = useTheme();
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [days, setDays] = useState<number>(7);
  const [series, setSeries] = useState<DefiHistorySeries[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDefiHistory(days, category);
      setSeries(res.series);
    } catch {
      setSeries([]);
    }
    setLoading(false);
  }, [days, category]);

  useEffect(() => {
    void loadData(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [loadData]);

  useEffect(() => {
    if (!containerRef.current || series.length === 0) return;

    const colors = themeColors[theme] || themeColors.quantum;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderVisible: false },
    });
    chartRef.current = chart;

    series.forEach((s, i) => {
      const line = chart.addSeries(LineSeries, {
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        lineWidth: 2,
        title: s.protocol,
      });
      line.setData(s.data.map((d) => ({ time: d.time as UTCTimestamp, value: d.tvl })));
    });

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [series, theme]);

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {t("market.tvlTrend")}
        </span>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="rounded px-2 py-0.5 text-xs font-medium transition-colors"
              style={{
                background: days === d ? "var(--accent-primary)" : "var(--bg-secondary)",
                color: days === d ? "#fff" : "var(--text-muted)",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div
          className="flex items-center justify-center text-sm text-[var(--text-muted)]"
          style={{ height: 280 }}
        >
          {t("common.loading")}
        </div>
      ) : series.length === 0 ? (
        <div
          className="flex items-center justify-center text-sm text-[var(--text-muted)]"
          style={{ height: 280 }}
        >
          {t("common.noData")}
        </div>
      ) : (
        <>
          <div ref={containerRef} />
          <div className="mt-2 flex flex-wrap gap-3">
            {series.map((s, i) => (
              <span
                key={s.protocol}
                className="flex items-center gap-1 text-xs text-[var(--text-muted)]"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                />
                {s.protocol}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

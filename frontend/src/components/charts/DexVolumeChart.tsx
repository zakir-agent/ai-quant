"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { getDexHistory, type DexHistorySeries } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { useT } from "@/components/LanguageProvider";

const SERIES_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#22c55e",
  "#a855f7",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#e11d48",
  "#8b5cf6",
];
const DAY_OPTIONS = [7, 30, 90] as const;

const themeColors = {
  quantum: { background: "#0B1120", text: "#9ca3af", grid: "#1E293B" },
  neon: { background: "#000000", text: "#a3e635", grid: "#0A1A0A" },
};

interface Props {
  chain?: string;
}

export default function DexVolumeChart({ chain }: Props) {
  const { theme } = useTheme();
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const [days, setDays] = useState<number>(7);
  const [allSeries, setAllSeries] = useState<DexHistorySeries[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDexHistory(days, chain);
      setAllSeries(res.series);
      setVisible(new Set(res.series.slice(0, 5).map((s) => s.pair)));
    } catch {
      setAllSeries([]);
      setVisible(new Set());
    }
    setLoading(false);
  }, [days, chain]);

  useEffect(() => {
    void loadData(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [loadData]);

  useEffect(() => {
    if (!containerRef.current || allSeries.length === 0) return;

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
    seriesRefs.current.clear();

    allSeries.forEach((s, i) => {
      const line = chart.addSeries(LineSeries, {
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        lineWidth: 2,
        title: s.pair,
        visible: visible.has(s.pair),
      });
      const points = s.data
        .map((d) => ({ time: d.time as UTCTimestamp, value: d.volume_24h }))
        .sort((a, b) => a.time - b.time)
        .filter((p, idx, arr) => idx === 0 || p.time !== arr[idx - 1].time);
      line.setData(points);
      seriesRefs.current.set(s.pair, line);
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
      seriesRefs.current.clear();
    };
  }, [allSeries, theme, visible]);

  const toggleSeries = (pair: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(pair)) {
        next.delete(pair);
      } else {
        next.add(pair);
      }
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-[var(--card-shadow)] transition-colors duration-200 hover:border-[var(--border-hover)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--text-muted)] uppercase">
          {t("market.volumeTrend")}
        </span>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="rounded px-2 py-0.5 text-xs font-medium transition-colors"
              style={{
                background: days === d ? "var(--accent-primary)" : "var(--bg-secondary)",
                color: days === d ? "var(--text-primary)" : "var(--text-muted)",
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
      ) : allSeries.length === 0 ? (
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
            {allSeries.map((s, i) => (
              <button
                key={s.pair}
                onClick={() => toggleSeries(s.pair)}
                className="flex items-center gap-1 text-xs transition-opacity"
                style={{ opacity: visible.has(s.pair) ? 1 : 0.35 }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                />
                <span style={{ color: "var(--text-muted)" }}>{s.pair}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

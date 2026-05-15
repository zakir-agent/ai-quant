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
import { getNewsSignalTrend, type SignalTrendResponse } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { useT } from "@/components/LanguageProvider";

const SERIES_COLORS = ["#3b82f6", "#f59e0b", "#22c55e", "#a855f7", "#ec4899"];

const GRANULARITY_OPTIONS = [
  { value: "daily" as const, days: 30 },
  { value: "hourly" as const, days: 2 },
];

const themeColors = {
  quantum: { background: "#0B1120", text: "#9ca3af", grid: "#1E293B" },
  neon: { background: "#000000", text: "#a3e635", grid: "#0A1A0A" },
};

export default function SignalTrendChart() {
  const { theme } = useTheme();
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const [granularity, setGranularity] = useState<"hourly" | "daily">("daily");
  const [data, setData] = useState<SignalTrendResponse | null>(null);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opt = GRANULARITY_OPTIONS.find((o) => o.value === granularity)!;
      const res = await getNewsSignalTrend(granularity, opt.days);
      setData(res);
      setVisible(new Set(res.symbols.map((s) => s.symbol)));
    } catch {
      setData(null);
      setVisible(new Set());
      setError(t("common.loadFailed"));
    }
    setLoading(false);
  }, [granularity, t]);

  useEffect(() => {
    void loadData(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [loadData]);

  useEffect(() => {
    if (!containerRef.current || !data || data.symbols.length === 0) return;

    const colors = themeColors[theme] || themeColors.quantum;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 260,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      timeScale: { timeVisible: granularity === "hourly", secondsVisible: false },
      rightPriceScale: { borderVisible: false },
    });
    chartRef.current = chart;
    seriesRefs.current.clear();

    data.symbols.forEach((s, i) => {
      const line = chart.addSeries(LineSeries, {
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        lineWidth: 2,
        title: s.symbol,
        visible: visible.has(s.symbol),
      });
      const points = s.trend
        .filter((p) => p.time)
        .map((p) => ({
          time: (new Date(p.time!).getTime() / 1000) as UTCTimestamp,
          value: p.avg_weighted_score,
        }))
        .sort((a, b) => a.time - b.time)
        .filter((p, idx, arr) => idx === 0 || p.time !== arr[idx - 1].time);
      line.setData(points);
      seriesRefs.current.set(s.symbol, line);
    });

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRefs.current.clear();
    };
  }, [data, theme, visible, granularity]);

  const toggleSeries = (symbol: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const directionStyle = (d: string) => {
    if (d === "bullish") return { icon: "▲", color: "var(--success)" };
    if (d === "bearish") return { icon: "▼", color: "var(--danger)" };
    return { icon: "●", color: "var(--text-muted)" };
  };

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {t("news.signalTrend")}
        </span>
        <div className="flex gap-1">
          {GRANULARITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGranularity(opt.value)}
              className="rounded px-2 py-0.5 text-xs font-medium transition-colors"
              style={{
                background:
                  granularity === opt.value ? "var(--accent-primary)" : "var(--bg-secondary)",
                color: granularity === opt.value ? "#fff" : "var(--text-muted)",
              }}
            >
              {opt.value === "hourly" ? t("news.hourly") : `${opt.days}d`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div
          className="flex items-center justify-center text-sm text-[var(--text-muted)]"
          style={{ height: 260 }}
        >
          {t("common.loading")}
        </div>
      ) : error ? (
        <div
          className="flex flex-col items-center justify-center gap-2 text-sm"
          style={{ height: 260 }}
        >
          <span className="text-[var(--danger)]">{error}</span>
          <button
            onClick={() => void loadData()}
            className="text-xs text-[var(--accent-primary)] hover:underline"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : !data || data.symbols.length === 0 ? (
        <div
          className="flex items-center justify-center text-sm text-[var(--text-muted)]"
          style={{ height: 260 }}
        >
          {t("common.noData")}
        </div>
      ) : (
        <>
          <div ref={containerRef} />
          <div className="mt-2 flex flex-wrap gap-3">
            {data.symbols.map((s, i) => {
              const ds = directionStyle(s.direction);
              return (
                <button
                  key={s.symbol}
                  onClick={() => toggleSeries(s.symbol)}
                  className="flex items-center gap-1 text-xs transition-opacity"
                  style={{ opacity: visible.has(s.symbol) ? 1 : 0.35 }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      background: SERIES_COLORS[i % SERIES_COLORS.length],
                    }}
                  />
                  <span style={{ color: ds.color }}>{ds.icon}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {s.symbol} {Math.abs(s.avg_weighted_score).toFixed(0)} ({s.event_count})
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  HistogramSeries,
  LineSeries,
  ColorType,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  getNewsSignalTrend,
  type SignalTrendResponse,
  type SignalTrendSymbol,
} from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { useT } from "@/components/LanguageProvider";
import { useDebouncedResize } from "@/lib/use-debounced-resize";

const SERIES_COLORS = ["#3b82f6", "#f59e0b", "#22c55e", "#a855f7", "#ec4899"];
const HEAT_SCALE_ID = "heat";
const SIGNAL_RANGE = { minValue: 0, maxValue: 100 };

const GRANULARITY_OPTIONS = [
  { value: "daily" as const, days: 30 },
  { value: "hourly" as const, days: 2 },
];

const themeColors = {
  quantum: { background: "#0B1120", text: "#9ca3af", grid: "#1E293B", heat: "59, 130, 246" },
  neon: { background: "#000000", text: "#a3e635", grid: "#0A1A0A", heat: "163, 230, 53" },
};

type ThemeKey = keyof typeof themeColors;

function directionStyle(d: string) {
  if (d === "bullish") return { icon: "▲", color: "var(--success)" };
  if (d === "bearish") return { icon: "▼", color: "var(--danger)" };
  return { icon: "●", color: "var(--text-muted)" };
}

function directionLabel(d: string, t: (key: string) => string) {
  if (d === "bullish") return t("news.bullish");
  if (d === "bearish") return t("news.bearish");
  return t("news.neutralDir");
}

function confidenceLabel(c: string, t: (key: string) => string) {
  if (c === "high") return t("news.confidenceHigh");
  if (c === "medium") return t("news.confidenceMedium");
  return t("news.confidenceLow");
}

function buildLegendTooltip(symbol: SignalTrendSymbol, t: (key: string) => string) {
  return [
    symbol.symbol,
    `${t("news.signalTooltipDirection")}: ${directionLabel(symbol.direction, t)}`,
    `${t("news.signalTooltipScore")}: ${Math.abs(symbol.avg_weighted_score).toFixed(0)}`,
    `${t("news.signalTooltipCount")}: ${symbol.event_count}`,
    `${t("news.signalTooltipConfidence")}: ${confidenceLabel(symbol.confidence, t)}`,
  ].join("\n");
}

function heatBarColor(intensity: number, theme: ThemeKey) {
  const alpha = 0.06 + intensity * 0.2;
  return `rgba(${themeColors[theme].heat}, ${alpha.toFixed(3)})`;
}

function buildHeatData(
  symbols: SignalTrendSymbol[],
  visible: Set<string>,
  theme: ThemeKey,
): HistogramData<UTCTimestamp>[] {
  const bucket = new Map<number, number>();
  for (const s of symbols) {
    if (!visible.has(s.symbol)) continue;
    for (const p of s.trend) {
      if (!p.time) continue;
      const ts = Math.floor(new Date(p.time).getTime() / 1000);
      bucket.set(ts, (bucket.get(ts) ?? 0) + p.event_count);
    }
  }
  const maxCount = Math.max(...bucket.values(), 1);
  return [...bucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, count]) => ({
      time: time as UTCTimestamp,
      value: count,
      color: heatBarColor(count / maxCount, theme),
    }));
}

function toLinePoints(trend: SignalTrendSymbol["trend"]) {
  return trend
    .filter((p) => p.time)
    .map((p) => ({
      time: (new Date(p.time!).getTime() / 1000) as UTCTimestamp,
      value: p.avg_weighted_score,
    }))
    .sort((a, b) => a.time - b.time)
    .filter((p, idx, arr) => idx === 0 || p.time !== arr[idx - 1].time);
}

export default function SignalTrendChart() {
  const { theme } = useTheme();
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const heatSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
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

    const palette = themeColors[theme as ThemeKey] || themeColors.quantum;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 260,
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      timeScale: { timeVisible: granularity === "hourly", secondsVisible: false },
      rightPriceScale: {
        borderVisible: false,
        autoScale: false,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
    });
    chartRef.current = chart;
    seriesRefs.current.clear();

    const heatSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: HEAT_SCALE_ID,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale(HEAT_SCALE_ID).applyOptions({
      visible: false,
      autoScale: true,
    });
    heatSeries.setData(buildHeatData(data.symbols, visible, theme as ThemeKey));
    heatSeriesRef.current = heatSeries;

    data.symbols.forEach((s, i) => {
      const line = chart.addSeries(LineSeries, {
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        lineWidth: 2,
        title: s.symbol,
        visible: visible.has(s.symbol),
        priceScaleId: "right",
        autoscaleInfoProvider: () => ({
          priceRange: SIGNAL_RANGE,
        }),
      });
      line.setData(toLinePoints(s.trend));
      seriesRefs.current.set(s.symbol, line);
    });

    chart.timeScale().fitContent();

    const currentSeriesRefs = seriesRefs.current;

    return () => {
      chart.remove();
      chartRef.current = null;
      heatSeriesRef.current = null;
      currentSeriesRefs.clear();
    };
  }, [data, theme, granularity]); // eslint-disable-line react-hooks/exhaustive-deps -- visible handled below

  useEffect(() => {
    if (!data) return;
    if (heatSeriesRef.current) {
      heatSeriesRef.current.setData(
        buildHeatData(data.symbols, visible, theme as ThemeKey),
      );
    }
    for (const [key, line] of seriesRefs.current) {
      line.applyOptions({ visible: visible.has(key) });
    }
  }, [visible, data, theme]);

  const toggleSeries = useCallback((symbol: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  }, []);

  useDebouncedResize(containerRef, () => {
    if (chartRef.current && containerRef.current) {
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    }
  });

  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-4 shadow-[var(--card-shadow)] transition-colors duration-200 hover:border-[var(--border-hover)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--text-muted)] uppercase">
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
                color: granularity === opt.value ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {opt.value === "hourly" ? t("news.hourly") : `${opt.days}d`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div
          className="animate-pulse rounded-lg bg-[var(--bg-secondary)] sm:h-[260px]"
          style={{ height: 180 }}
          aria-hidden
        />
      ) : error ? (
        <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-sm sm:h-[260px]">
          <span className="text-[var(--danger)]">{error}</span>
          <button
            onClick={() => void loadData()}
            className="text-xs text-[var(--accent-primary)] hover:underline"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : !data || data.symbols.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-[var(--text-muted)] sm:h-[260px]">
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
                  title={buildLegendTooltip(s, t)}
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

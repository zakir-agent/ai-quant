"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from "lightweight-charts";
import type { KlineCandle } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { useDebouncedResize } from "@/lib/use-debounced-resize";
import { KLINE_LOAD_THRESHOLD, defaultLogicalRange, defaultRightOffset } from "@/lib/kline-limits";

export interface IndicatorSeries {
  [name: string]: { time: number; value: number }[];
}

interface KlineChartProps {
  data: KlineCandle[];
  symbol: string;
  seriesKey: string;
  indicators?: IndicatorSeries;
  activeIndicators?: Set<string>;
  onNeedMoreData?: () => void;
  hasMoreData?: boolean;
  loadingMore?: boolean;
}

const themeColors = {
  quantum: {
    background: "#0B1120",
    text: "#9ca3af",
    grid: "#1E293B",
    border: "#374151",
    upColor: "#22c55e",
    downColor: "#ef4444",
    volumeUp: "rgba(34,197,94,0.3)",
    volumeDown: "rgba(239,68,68,0.3)",
    volumeDefault: "#6366f1",
  },
  neon: {
    background: "#000000",
    text: "#a3e635",
    grid: "#0A1A0A",
    border: "#1a3a1a",
    upColor: "#00FF88",
    downColor: "#FF0080",
    volumeUp: "rgba(0,255,136,0.3)",
    volumeDown: "rgba(255,0,128,0.3)",
    volumeDefault: "#00FF88",
  },
};

const INDICATOR_COLORS: Record<string, string> = {
  ma_7: "#f59e0b",
  ma_25: "#3b82f6",
  ma_50: "#a855f7",
  bollinger_upper: "rgba(100,100,255,0.5)",
  bollinger_middle: "rgba(100,100,255,0.3)",
  bollinger_lower: "rgba(100,100,255,0.5)",
  rsi: "#f59e0b",
  macd: "#3b82f6",
  macd_signal: "#ef4444",
};

const MAIN_OVERLAYS = [
  "ma_7",
  "ma_25",
  "ma_50",
  "bollinger_upper",
  "bollinger_middle",
  "bollinger_lower",
] as const;

function applyDefaultViewport(chart: IChartApi, barCount: number) {
  const range = defaultLogicalRange(barCount);
  chart.timeScale().applyOptions({ rightOffset: defaultRightOffset(barCount) });
  if (!range) {
    chart.timeScale().fitContent();
    return;
  }
  // Defer until lightweight-charts finishes indexing the new series data.
  requestAnimationFrame(() => {
    chart.timeScale().setVisibleLogicalRange(range);
  });
}

export default function KlineChart({
  data,
  seriesKey,
  indicators,
  activeIndicators,
  onNeedMoreData,
  hasMoreData = true,
  loadingMore = false,
}: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indicatorSeriesRefs = useRef<Map<string, ISeriesApi<"Line"> | ISeriesApi<"Histogram">>>(
    new Map(),
  );
  const initializedRef = useRef(false);
  const prevDataMetaRef = useRef<{ first: number; len: number } | null>(null);
  const seriesKeyRef = useRef(seriesKey);
  const loadCooldownRef = useRef(false);
  const skipNextRangeEventRef = useRef(true);
  const onNeedMoreDataRef = useRef(onNeedMoreData);
  const hasMoreDataRef = useRef(hasMoreData);
  const loadingMoreRef = useRef(loadingMore);
  const { theme } = useTheme();

  useEffect(() => {
    onNeedMoreDataRef.current = onNeedMoreData;
    hasMoreDataRef.current = hasMoreData;
    loadingMoreRef.current = loadingMore;
  }, [onNeedMoreData, hasMoreData, loadingMore]);

  const hasRsi = activeIndicators?.has("rsi");
  const hasMacd = activeIndicators?.has("macd");

  // Setup effect: chart shell + visible-range subscription (not tied to indicator data)
  useEffect(() => {
    if (!containerRef.current) return;

    const colors = themeColors[theme] || themeColors.quantum;

    let height = 400;
    if (hasRsi) height += 120;
    if (hasMacd) height += 120;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      width: containerRef.current.clientWidth,
      height,
      crosshair: { mode: 0 },
      timeScale: { borderColor: colors.border, timeVisible: true },
      rightPriceScale: { borderColor: colors.border },
    });

    let mainBottom = 0.15;
    if (hasRsi) mainBottom += 0.12;
    if (hasMacd) mainBottom += 0.12;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.upColor,
      downColor: colors.downColor,
      borderDownColor: colors.downColor,
      borderUpColor: colors.upColor,
      wickDownColor: colors.downColor,
      wickUpColor: colors.upColor,
    });
    chart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.02, bottom: mainBottom },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: colors.volumeDefault,
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 1 - mainBottom, bottom: hasRsi || hasMacd ? mainBottom - 0.15 : 0 },
    });

    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    indicatorSeriesRefs.current.clear();
    if (activeIndicators) {
      for (const name of MAIN_OVERLAYS) {
        const group = name.startsWith("ma") ? "ma" : "bollinger";
        if (!activeIndicators.has(group)) continue;

        const line = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS[name] || "#888",
          lineWidth: name.includes("bollinger") ? 1 : 2,
          priceScaleId: "right",
        });
        indicatorSeriesRefs.current.set(name, line);
      }

      if (hasRsi) {
        const rsiPaneTop = 1 - mainBottom + 0.15 + 0.01;
        const rsiSeries = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.rsi,
          lineWidth: 2,
          priceScaleId: "rsi",
          priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(0) },
        });
        chart.priceScale("rsi").applyOptions({
          scaleMargins: { top: rsiPaneTop, bottom: hasMacd ? 0.14 : 0.02 },
          autoScale: true,
        });
        rsiSeries.createPriceLine({
          price: 70,
          color: "rgba(239,68,68,0.4)",
          lineWidth: 1,
          lineStyle: 2,
        });
        rsiSeries.createPriceLine({
          price: 30,
          color: "rgba(34,197,94,0.4)",
          lineWidth: 1,
          lineStyle: 2,
        });
        indicatorSeriesRefs.current.set("rsi", rsiSeries);
      }

      if (hasMacd) {
        const macdPaneTop = hasRsi ? 1 - 0.13 : 1 - mainBottom + 0.15 + 0.01;

        const macdLine = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.macd,
          lineWidth: 2,
          priceScaleId: "macd",
        });
        chart.priceScale("macd").applyOptions({
          scaleMargins: { top: macdPaneTop, bottom: 0.02 },
          autoScale: true,
        });
        indicatorSeriesRefs.current.set("macd", macdLine);

        const sigLine = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.macd_signal,
          lineWidth: 1,
          priceScaleId: "macd",
        });
        indicatorSeriesRefs.current.set("macd_signal", sigLine);

        const histSeries = chart.addSeries(HistogramSeries, {
          priceScaleId: "macd",
        });
        indicatorSeriesRefs.current.set("macd_histogram", histSeries);
      }
    }

    const onVisibleRangeChange = (range: LogicalRange | null) => {
      if (skipNextRangeEventRef.current) {
        skipNextRangeEventRef.current = false;
        return;
      }
      if (
        !range ||
        !onNeedMoreDataRef.current ||
        !hasMoreDataRef.current ||
        loadingMoreRef.current ||
        loadCooldownRef.current
      ) {
        return;
      }

      const info = candleSeries.barsInLogicalRange(range);
      if (!info || info.barsBefore >= KLINE_LOAD_THRESHOLD) return;

      loadCooldownRef.current = true;
      onNeedMoreDataRef.current();
      window.setTimeout(() => {
        loadCooldownRef.current = false;
      }, 800);
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange);
    chartRef.current = chart;
    initializedRef.current = false;
    prevDataMetaRef.current = null;
    seriesKeyRef.current = seriesKey;
    skipNextRangeEventRef.current = true;

    const currentIndicatorRefs = indicatorSeriesRefs.current;

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      currentIndicatorRefs.clear();
    };
  }, [theme, activeIndicators, hasRsi, hasMacd, seriesKey]);

  // Indicator data updates (without rebuilding the chart)
  useEffect(() => {
    if (!indicators || !activeIndicators) return;

    for (const name of MAIN_OVERLAYS) {
      const series = indicatorSeriesRefs.current.get(name);
      const seriesData = indicators[name];
      if (!series || !seriesData?.length) continue;
      const group = name.startsWith("ma") ? "ma" : "bollinger";
      if (!activeIndicators.has(group)) continue;
      series.setData(seriesData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
    }

    const colors = themeColors[theme] || themeColors.quantum;

    if (hasRsi && indicators.rsi) {
      indicatorSeriesRefs.current
        .get("rsi")
        ?.setData(indicators.rsi.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
    }

    if (hasMacd) {
      if (indicators.macd) {
        indicatorSeriesRefs.current
          .get("macd")
          ?.setData(indicators.macd.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      }
      if (indicators.macd_signal) {
        indicatorSeriesRefs.current.get("macd_signal")?.setData(
          indicators.macd_signal.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.value,
          })),
        );
      }
      if (indicators.macd_histogram) {
        indicatorSeriesRefs.current.get("macd_histogram")?.setData(
          indicators.macd_histogram.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.value,
            color: d.value >= 0 ? colors.upColor : colors.downColor,
          })),
        );
      }
    }
  }, [indicators, activeIndicators, hasRsi, hasMacd, theme]);

  // Candle / volume data updates
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || data.length === 0) return;

    const colors = themeColors[theme] || themeColors.quantum;
    const meta = { first: data[0].time, len: data.length };
    const prev = prevDataMetaRef.current;
    const seriesChanged = seriesKeyRef.current !== seriesKey;

    const isFullReload =
      seriesChanged ||
      !initializedRef.current ||
      !prev ||
      meta.first !== prev.first ||
      meta.len > prev.len + 1;

    if (isFullReload) {
      const prevLen = prev?.len ?? 0;
      const visibleRange = chart?.timeScale().getVisibleLogicalRange();

      candleSeries.setData(
        data.map((d) => ({
          time: d.time as UTCTimestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })),
      );
      volumeSeries.setData(
        data.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.volume,
          color: d.close >= d.open ? colors.volumeUp : colors.volumeDown,
        })),
      );

      if (chart) {
        if (seriesChanged || !prev) {
          skipNextRangeEventRef.current = true;
          applyDefaultViewport(chart, meta.len);
        } else if (prevLen > 0 && meta.len > prevLen && visibleRange) {
          const added = meta.len - prevLen;
          skipNextRangeEventRef.current = true;
          chart.timeScale().setVisibleLogicalRange({
            from: visibleRange.from + added,
            to: visibleRange.to + added,
          });
        }
      }

      initializedRef.current = true;
      seriesKeyRef.current = seriesKey;
    } else {
      const last = data[data.length - 1];
      candleSeries.update({
        time: last.time as UTCTimestamp,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      });
      volumeSeries.update({
        time: last.time as UTCTimestamp,
        value: last.volume,
        color: last.close >= last.open ? colors.volumeUp : colors.volumeDown,
      });
    }

    prevDataMetaRef.current = meta;
  }, [data, theme, seriesKey, activeIndicators, hasRsi, hasMacd]);

  useDebouncedResize(containerRef, () => {
    if (chartRef.current && containerRef.current) {
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    }
  });

  return <div ref={containerRef} />;
}

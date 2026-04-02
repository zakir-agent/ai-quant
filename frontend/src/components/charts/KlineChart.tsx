"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { KlineCandle } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";

export interface IndicatorSeries {
  [name: string]: { time: number; value: number }[];
}

interface KlineChartProps {
  data: KlineCandle[];
  symbol: string;
  indicators?: IndicatorSeries;
  activeIndicators?: Set<string>;
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

export default function KlineChart({ data, indicators, activeIndicators }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { theme } = useTheme();

  const hasRsi = activeIndicators?.has("rsi") && indicators?.rsi?.length;
  const hasMacd = activeIndicators?.has("macd") && indicators?.macd?.length;

  useEffect(() => {
    if (!containerRef.current) return;

    const colors = themeColors[theme] || themeColors.quantum;

    // Dynamic height based on sub-panes
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

    // Calculate scale margins based on active sub-panes
    let mainBottom = 0.15; // volume area
    if (hasRsi) mainBottom += 0.12;
    if (hasMacd) mainBottom += 0.12;

    // Candlestick series
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

    // Volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: colors.volumeDefault,
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 1 - mainBottom, bottom: hasRsi || hasMacd ? mainBottom - 0.15 : 0 },
    });

    // Set candle + volume data
    if (data.length > 0) {
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
    }

    // Main chart indicators (MA, Bollinger)
    if (indicators && activeIndicators) {
      const mainOverlays = [
        "ma_7",
        "ma_25",
        "ma_50",
        "bollinger_upper",
        "bollinger_middle",
        "bollinger_lower",
      ];
      for (const name of mainOverlays) {
        const seriesData = indicators[name];
        if (!seriesData?.length) continue;
        // Check if parent indicator group is active
        const group = name.startsWith("ma") ? "ma" : "bollinger";
        if (!activeIndicators.has(group)) continue;

        const line = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS[name] || "#888",
          lineWidth: name.includes("bollinger") ? 1 : 2,
          priceScaleId: "right",
        });
        line.setData(seriesData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
      }

      // RSI sub-pane
      if (hasRsi && indicators.rsi) {
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
        rsiSeries.setData(
          indicators.rsi.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
        );

        // Reference lines at 30 and 70
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
      }

      // MACD sub-pane
      if (hasMacd) {
        const macdPaneTop = hasRsi ? 1 - 0.13 : 1 - mainBottom + 0.15 + 0.01;

        if (indicators.macd) {
          const macdLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.macd,
            lineWidth: 2,
            priceScaleId: "macd",
          });
          chart.priceScale("macd").applyOptions({
            scaleMargins: { top: macdPaneTop, bottom: 0.02 },
            autoScale: true,
          });
          macdLine.setData(
            indicators.macd.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
          );
        }

        if (indicators.macd_signal) {
          const sigLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.macd_signal,
            lineWidth: 1,
            priceScaleId: "macd",
          });
          sigLine.setData(
            indicators.macd_signal.map((d) => ({
              time: d.time as UTCTimestamp,
              value: d.value,
            })),
          );
        }

        if (indicators.macd_histogram) {
          const histSeries = chart.addSeries(HistogramSeries, {
            priceScaleId: "macd",
          });
          histSeries.setData(
            indicators.macd_histogram.map((d) => ({
              time: d.time as UTCTimestamp,
              value: d.value,
              color: d.value >= 0 ? colors.upColor : colors.downColor,
            })),
          );
        }
      }
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, theme, indicators, activeIndicators, hasRsi, hasMacd]);

  return <div ref={containerRef} />;
}

"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
} from "lightweight-charts";
import type { KlineCandle } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";

interface KlineChartProps {
  data: KlineCandle[];
  symbol: string;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function KlineChart({ data, symbol }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    const colors = themeColors[theme] || themeColors.quantum;

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
      height: 400,
      crosshair: {
        mode: 0,
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: colors.border,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.upColor,
      downColor: colors.downColor,
      borderDownColor: colors.downColor,
      borderUpColor: colors.upColor,
      wickDownColor: colors.downColor,
      wickUpColor: colors.upColor,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: colors.volumeDefault,
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    if (data.length > 0) {
      candleSeries.setData(
        data.map((d) => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          time: d.time as any,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })),
      );
      volumeSeries.setData(
        data.map((d) => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          time: d.time as any,
          value: d.volume,
          color: d.close >= d.open ? colors.volumeUp : colors.volumeDown,
        })),
      );
      chart.timeScale().fitContent();
    }

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
  }, [data, theme]);

  return <div ref={containerRef} />;
}

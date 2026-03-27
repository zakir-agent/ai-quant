"use client";

import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, HistogramSeries, ColorType, type IChartApi } from "lightweight-charts";
import type { KlineCandle } from "@/lib/api";

interface KlineChartProps {
  data: KlineCandle[];
  symbol: string;
}

export default function KlineChart({ data, symbol }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#111827" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      width: containerRef.current.clientWidth,
      height: 400,
      crosshair: {
        mode: 0,
      },
      timeScale: {
        borderColor: "#374151",
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: "#374151",
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#6366f1",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    if (data.length > 0) {
      candleSeries.setData(
        data.map((d) => ({ time: d.time as any, open: d.open, high: d.high, low: d.low, close: d.close }))
      );
      volumeSeries.setData(
        data.map((d) => ({
          time: d.time as any,
          value: d.volume,
          color: d.close >= d.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
        }))
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
  }, [data]);

  return <div ref={containerRef} />;
}

"use client";

import { useEffect, useRef, useState } from "react";

import { getDataIntegrity, type DataIntegrity } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

interface DataIntegrityBadgeProps {
  symbol: string;
  timeframe: string;
  exchange?: string;
}

// Map timeframe → default days to keep the check window proportional to the chart.
function defaultDaysFor(timeframe: string): 7 | 30 | 90 {
  if (timeframe === "1d") return 90;
  if (timeframe === "4h") return 30;
  return 7;
}

// Only timeframes the project actually collects on a schedule (CEX_DEFAULT_TIMEFRAMES).
// Showing the badge for 1m/5m/15m would always be 0% — misleading.
const SUPPORTED_TIMEFRAMES = new Set(["1h", "4h", "1d"]);

function colorFor(pct: number): string {
  if (pct >= 95) return "var(--success)";
  if (pct >= 80) return "var(--warning)";
  return "var(--danger)";
}

export default function DataIntegrityBadge({
  symbol,
  timeframe,
  exchange = "binance",
}: DataIntegrityBadgeProps) {
  const t = useT();
  const [data, setData] = useState<DataIntegrity | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const supported = SUPPORTED_TIMEFRAMES.has(timeframe);
  const days = defaultDaysFor(timeframe);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const d = await getDataIntegrity(symbol, timeframe, days);
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, days, exchange, supported]);

  // Close popover when clicking outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  if (!supported) return null;

  const dotColor = data ? colorFor(data.completeness_pct) : "var(--text-muted)";
  const pctText = loading && !data ? "…" : data ? `${data.completeness_pct}%` : "—";
  const tooltip = data
    ? `${data.days}d · ${data.actual_candles}/${data.expected_candles} · ${t("settings.gaps")}: ${data.gap_count}`
    : t("common.loading");

  return (
    <div ref={wrapperRef} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={tooltip}
        className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-primary)",
          color: "var(--text-muted)",
        }}
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <span className="font-mono text-[var(--text-primary)]">{pctText}</span>
        <span className="hidden text-[10px] uppercase tracking-wider sm:inline">
          {t("settings.dataIntegrity")}
        </span>
      </button>

      {open && data && (
        <div
          className="absolute right-0 z-20 mt-1 w-80 rounded-md border p-3 text-xs shadow-lg"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-primary)",
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[var(--text-primary)]">
              {data.symbol} · {data.timeframe} · {data.days}d
            </span>
            <span className="font-mono" style={{ color: dotColor }}>
              {data.completeness_pct}%
            </span>
          </div>
          <div className="flex justify-between text-[var(--text-muted)]">
            <span>
              {t("settings.expectedCandles")}: {data.expected_candles}
            </span>
            <span>
              {t("settings.actualCandles")}: {data.actual_candles}
            </span>
            <span>
              {t("settings.gaps")}: {data.gap_count}
            </span>
          </div>
          {data.gaps.length > 0 && (
            <div
              className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded p-2"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              {data.gaps.slice(0, 8).map((g, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="text-[var(--text-muted)]">
                    {new Date(g.from).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    →{" "}
                    {new Date(g.to).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="shrink-0" style={{ color: "var(--danger)" }}>
                    {g.missing_candles} {t("settings.missingCandles")}
                  </span>
                </div>
              ))}
              {data.gaps.length > 8 && (
                <p className="text-[var(--text-muted)]">
                  ...+{data.gaps.length - 8} {t("settings.moreGaps")}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

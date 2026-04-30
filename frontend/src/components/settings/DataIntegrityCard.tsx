"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import { StatusDot } from "./shared";
import { useLanguage } from "@/components/LanguageProvider";
import {
  getDataIntegrity,
  getDataIntegritySummary,
  type DataIntegrity,
  type DataIntegritySummary,
  type DataIntegrityCell,
} from "@/lib/api";

export default function DataIntegrityCard() {
  const { t, locale } = useLanguage();
  const dateLocale = locale === "zh" ? "zh-CN" : "en-US";

  const [integritySummary, setIntegritySummary] = useState<DataIntegritySummary | null>(null);
  const [integrityDays, setIntegrityDays] = useState<7 | 30 | 90>(7);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DataIntegrity | null>(null);
  const [selectedDetailLoading, setSelectedDetailLoading] = useState(false);

  const loadIntegritySummary = useCallback((days: 7 | 30 | 90) => {
    setIntegrityLoading(true);
    getDataIntegritySummary(days)
      .then(setIntegritySummary)
      .catch(() => setIntegritySummary(null))
      .finally(() => setIntegrityLoading(false));
  }, []);

  useEffect(() => {
    loadIntegritySummary(integrityDays);
    setSelectedCellKey(null);
    setSelectedDetail(null);
  }, [integrityDays, loadIntegritySummary]);

  const cellKey = (c: { exchange: string; symbol: string; timeframe: string }) =>
    `${c.exchange}|${c.symbol}|${c.timeframe}`;

  const handleSelectCell = (cell: DataIntegrityCell) => {
    const key = cellKey(cell);
    if (selectedCellKey === key) {
      setSelectedCellKey(null);
      setSelectedDetail(null);
      return;
    }
    setSelectedCellKey(key);
    setSelectedDetail(null);
    setSelectedDetailLoading(true);
    getDataIntegrity(cell.symbol, cell.timeframe as "1h" | "4h" | "1d", integrityDays)
      .then(setSelectedDetail)
      .catch(() => setSelectedDetail(null))
      .finally(() => setSelectedDetailLoading(false));
  };

  const integrityMatrix = useMemo(() => {
    if (!integritySummary) return null;
    const tfs = integritySummary.timeframes;
    const bySymbol = new Map<string, Map<string, DataIntegrityCell>>();
    const exchangeBySymbol = new Map<string, string>();
    for (const cell of integritySummary.cells) {
      if (!bySymbol.has(cell.symbol)) bySymbol.set(cell.symbol, new Map());
      bySymbol.get(cell.symbol)!.set(cell.timeframe, cell);
      exchangeBySymbol.set(cell.symbol, cell.exchange);
    }
    let rows = Array.from(bySymbol.entries()).map(([symbol, tfMap]) => ({
      symbol,
      exchange: exchangeBySymbol.get(symbol) ?? "binance",
      cells: tfs.map((tf) => tfMap.get(tf)),
      worst: Math.min(
        ...tfs
          .map((tf) => tfMap.get(tf)?.completeness_pct)
          .filter((v): v is number => typeof v === "number"),
      ),
    }));
    if (showOnlyIssues) rows = rows.filter((r) => r.worst < 100);
    rows.sort((a, b) => a.worst - b.worst || a.symbol.localeCompare(b.symbol));
    return { tfs, rows };
  }, [integritySummary, showOnlyIssues]);

  const integrityCellColor = (pct: number) => {
    if (pct >= 95) return "var(--success)";
    if (pct >= 80) return "var(--warning)";
    return "var(--danger)";
  };

  return (
    <Card title={t("settings.klineIntegrity")}>
      <div className="space-y-3 text-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {([7, 30, 90] as const).map((d) => {
              const active = integrityDays === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setIntegrityDays(d)}
                  className="rounded px-2 py-1 text-xs font-medium transition"
                  style={{
                    backgroundColor: active ? "var(--accent-primary)" : "var(--bg-secondary)",
                    color: active ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  {d}d
                </button>
              );
            })}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={showOnlyIssues}
              onChange={(e) => setShowOnlyIssues(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent-primary)]"
            />
            {t("settings.onlyIssues")}
          </label>
          <button
            type="button"
            onClick={() => loadIntegritySummary(integrityDays)}
            className="rounded border px-2 py-1 text-xs transition"
            style={{
              borderColor: "var(--border-primary)",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-secondary)",
            }}
            disabled={integrityLoading}
          >
            {integrityLoading ? t("common.loading") : t("common.refresh")}
          </button>
          {integritySummary && (
            <div className="ml-auto flex items-center gap-3 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <StatusDot color="var(--success)" />
                {integritySummary.summary.healthy}
              </span>
              <span className="flex items-center gap-1">
                <StatusDot color="var(--warning)" />
                {integritySummary.summary.warning}
              </span>
              <span className="flex items-center gap-1">
                <StatusDot color="var(--danger)" />
                {integritySummary.summary.danger}
              </span>
              <span>
                {t("settings.gaps")}: {integritySummary.summary.total_gaps}
              </span>
            </div>
          )}
        </div>

        {/* Matrix */}
        {!integrityMatrix ? (
          <p className="text-[var(--text-muted)]">
            {integrityLoading ? t("common.loading") : t("common.noData")}
          </p>
        ) : integrityMatrix.rows.length === 0 ? (
          <p className="text-[var(--text-muted)]">
            {showOnlyIssues ? t("settings.allHealthy") : t("common.noData")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-1 text-xs">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="text-left font-normal">Symbol</th>
                  {integrityMatrix.tfs.map((tf) => (
                    <th key={tf} className="px-2 text-center font-mono font-normal">
                      {tf}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {integrityMatrix.rows.map((row) => (
                  <tr key={row.symbol}>
                    <td className="pr-2 font-mono text-[var(--text-primary)]">{row.symbol}</td>
                    {row.cells.map((cell, idx) => {
                      const tf = integrityMatrix.tfs[idx];
                      if (!cell) {
                        return (
                          <td key={tf} className="px-1 text-center">
                            <span className="text-[var(--text-muted)]">—</span>
                          </td>
                        );
                      }
                      const color = integrityCellColor(cell.completeness_pct);
                      const isSelected = selectedCellKey === cellKey(cell);
                      const title =
                        `${cell.symbol} · ${tf} · ${integrityDays}d\n` +
                        `${t("settings.actualCandles")}: ${cell.actual_candles}/${cell.expected_candles}\n` +
                        `${t("settings.gaps")}: ${cell.gap_count}`;
                      return (
                        <td key={tf} className="px-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleSelectCell(cell)}
                            title={title}
                            className="inline-flex w-full items-center justify-center gap-1 rounded px-2 py-1 font-mono transition"
                            style={{
                              backgroundColor: isSelected ? "var(--bg-secondary)" : "transparent",
                              outline: isSelected
                                ? `1px solid ${color}`
                                : "1px solid transparent",
                              color: "var(--text-primary)",
                            }}
                          >
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            {cell.completeness_pct}%
                            {cell.gap_count > 0 && (
                              <span className="text-[10px]" style={{ color: "var(--danger)" }}>
                                ·{cell.gap_count}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Selected cell detail */}
        {selectedCellKey && (
          <div
            className="space-y-2 rounded-lg p-3"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            {selectedDetailLoading ? (
              <p className="text-xs text-[var(--text-muted)]">{t("common.loading")}</p>
            ) : !selectedDetail ? (
              <p className="text-xs text-[var(--text-muted)]">{t("common.noData")}</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[var(--text-primary)]">
                    {selectedDetail.symbol} · {selectedDetail.timeframe} · {selectedDetail.days}d
                  </span>
                  <span className="text-[var(--text-muted)]">
                    {t("settings.actualCandles")}: {selectedDetail.actual_candles}/
                    {selectedDetail.expected_candles} · {t("settings.gaps")}:{" "}
                    {selectedDetail.gap_count}
                  </span>
                </div>
                {selectedDetail.gaps.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">{t("settings.noGaps")}</p>
                ) : (
                  <div className="space-y-1">
                    {selectedDetail.gaps.slice(0, 8).map((g, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-[var(--text-muted)]">
                          {new Date(g.from).toLocaleString(dateLocale)} →{" "}
                          {new Date(g.to).toLocaleString(dateLocale)}
                        </span>
                        <span style={{ color: "var(--danger)" }}>
                          {g.missing_candles} {t("settings.missingCandles")}
                        </span>
                      </div>
                    ))}
                    {selectedDetail.gaps.length > 8 && (
                      <p className="text-xs text-[var(--text-muted)]">
                        ...+{selectedDetail.gaps.length - 8} {t("settings.moreGaps")}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

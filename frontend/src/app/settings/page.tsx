"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getConfig,
  getSystemStatus,
  getSchedulerStatus,
  getDataIntegrity,
  getDataIntegritySummary,
  sendAlertTest,
  type AppConfig,
  type SystemStatus,
  type SchedulerStatus,
  type CollectorHealth,
  type DataIntegrity,
  type DataIntegritySummary,
  type DataIntegrityCell,
} from "@/lib/api";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import ErrorBlock from "@/components/ui/ErrorBlock";
import TelegramLogList from "@/components/settings/TelegramLogList";
import { useLanguage } from "@/components/LanguageProvider";

interface DataSourceRow {
  label: string;
  collector?: string;
  badge?: { text: string; color: string };
}

function StatusDot({ ok, color }: { ok?: boolean; color?: string }) {
  const bg = color || (ok ? "var(--success)" : "var(--danger)");
  return <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: bg }} />;
}

function healthColor(status: string) {
  if (status === "ok") return "var(--success)";
  if (status === "degraded") return "var(--warning)";
  if (status === "alert") return "var(--danger)";
  return "var(--text-muted)";
}

export default function SettingsPage() {
  const { t, locale } = useLanguage();
  const dateLocale = locale === "zh" ? "zh-CN" : "en-US";
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [tgLogOpen, setTgLogOpen] = useState(false);

  // K-line data integrity (matrix view)
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

  const loadSettings = () => {
    setError(null);
    Promise.all([getConfig(), getSystemStatus(), getSchedulerStatus()])
      .then(([c, s, sch]) => {
        setConfig(c);
        setStatus(s);
        setScheduler(sch);
      })
      .catch(() => setError("loadFailed"));
    loadIntegritySummary(integrityDays);
  };

  const handleSendTest = async () => {
    try {
      setTestSending(true);
      setTestResult(null);
      const result = await sendAlertTest();
      if (result.sent) {
        setTestResult("sent");
      } else if (result.reason === "not_configured" || result.reason === "disabled") {
        setTestResult("notConfigured");
      } else {
        setTestResult("failed");
      }
    } catch {
      setTestResult("failed");
    } finally {
      setTestSending(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => loadSettings());
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Group cells by symbol → tf → cell for matrix rendering
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

  if (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("settings.title")}</h2>
        <ErrorBlock
          message={t("common.loadFailed")}
          onRetry={loadSettings}
          retryLabel={t("common.retry")}
        />
      </div>
    );
  }

  if (!config || !status) {
    return (
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-6 text-2xl font-bold text-[var(--text-primary)]">
          {t("settings.title")}
        </h2>
        <p className="text-[var(--text-muted)]">{t("common.loading")}</p>
      </div>
    );
  }

  const healthByName: Record<string, CollectorHealth> = {};
  for (const h of status.collector_health ?? []) {
    healthByName[h.name] = h;
  }

  const dataSourceRows: DataSourceRow[] = [
    {
      label: "Binance API Key",
      badge: {
        text: config.data_sources.has_binance_key ? t("settings.dsConfigured") : "—",
        color: config.data_sources.has_binance_key ? "var(--success)" : "var(--text-muted)",
      },
    },
    { label: "Binance OHLCV", collector: "cex" },
    { label: "Binance Futures", collector: "futures" },
    {
      label: "CoinGecko",
      collector: "coingecko",
      badge: { text: t("common.free"), color: "var(--success)" },
    },
    {
      label: "DexScreener",
      collector: "dexscreener",
      badge: { text: t("common.free"), color: "var(--success)" },
    },
    {
      label: "DefiLlama",
      collector: "defillama",
      badge: { text: t("common.free"), color: "var(--success)" },
    },
    {
      label: "Fear & Greed",
      collector: "fear_greed",
      badge: { text: t("common.free"), color: "var(--success)" },
    },
    {
      label: "News (RSS + CoinGecko)",
      collector: "news",
      badge: { text: t("common.free"), color: "var(--success)" },
    },
    {
      label: "NewsAPI",
      collector: "newsapi",
      badge: { text: t("common.free"), color: "var(--success)" },
    },
  ];

  const formatRelativeTime = (iso: string | null) => {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t("common.justNow");
    if (mins < 60) return t("common.minutesAgo").replace("{n}", String(mins));
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("common.hoursAgo").replace("{n}", String(hours));
    const days = Math.floor(hours / 24);
    return t("common.daysAgo").replace("{n}", String(days));
  };

  const dataStats = [
    {
      label: t("settings.klineData"),
      value: status.data_counts.ohlcv.toLocaleString(),
      last: formatRelativeTime(status.last_collection.ohlcv),
    },
    {
      label: t("settings.dexData"),
      value: status.data_counts.dex_pairs.toLocaleString(),
      last: formatRelativeTime(status.last_collection.dex),
    },
    {
      label: t("settings.defiData"),
      value: status.data_counts.defi_protocols.toLocaleString(),
      last: formatRelativeTime(status.last_collection.defi),
    },
    {
      label: t("settings.newsData"),
      value: status.data_counts.news_articles.toLocaleString(),
      last: formatRelativeTime(status.last_collection.news),
    },
    {
      label: t("settings.analysisReports"),
      value: status.data_counts.analysis_reports.toLocaleString(),
      last: formatRelativeTime(status.last_collection.analysis),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("settings.title")}</h2>

      <div className="grid grid-cols-2 gap-6">
        {/* AI Config */}
        <Card title={t("settings.aiConfig")}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.primaryModel")}</span>
              <span className="font-mono text-[var(--text-primary)]">
                {config.ai.primary_model}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.fallbackModel")}</span>
              <span className="font-mono text-[var(--text-primary)]">
                {config.ai.fallback_model}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.fastModel")}</span>
              <span className="font-mono text-[var(--text-primary)]">{config.ai.fast_model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.dailyLimit")}</span>
              <span className="text-[var(--text-primary)]">
                {config.ai.max_analyses_per_day} {t("settings.timesPerDay")}
              </span>
            </div>
            <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border-primary)" }}>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">API Key</span>
                <StatusDot ok={config.ai.has_api_key} />
              </div>
            </div>
          </div>
        </Card>

        {/* AI Usage Today */}
        <Card title={t("settings.aiUsage")}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.analysisCount")}</span>
              <span className="text-[var(--text-primary)]">
                {status.ai_usage_today.analyses_count} / {status.ai_usage_today.daily_limit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.totalCost")}</span>
              <span className="font-mono text-[var(--text-primary)]">
                ${status.ai_usage_today.total_cost_usd}
              </span>
            </div>
            {/* Progress bar */}
            <div
              className="mt-2 h-2 w-full rounded-full"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (status.ai_usage_today.analyses_count / status.ai_usage_today.daily_limit) * 100)}%`,
                  backgroundColor: "var(--accent-primary)",
                }}
              />
            </div>
          </div>
        </Card>

        {/* Data Sources (with collector health) */}
        <Card title={t("settings.dataSources")}>
          <div className="space-y-1.5 text-sm">
            {dataSourceRows.map((row) => {
              const health = row.collector ? healthByName[row.collector] : undefined;
              const dotColor = health
                ? healthColor(health.status)
                : row.collector
                  ? "var(--text-muted)"
                  : undefined;
              const lastRun = health?.last_run_at
                ? new Date(health.last_run_at).toLocaleString(dateLocale, {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : null;
              const tooltip = health
                ? `${health.status}${
                    health.consecutive_failures > 0
                      ? ` · ${t("settings.failures")}: ${health.consecutive_failures}`
                      : ""
                  }${health.last_error ? `\n${health.last_error}` : ""}`
                : row.collector
                  ? t("settings.collectorPending")
                  : "";
              return (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {dotColor && <StatusDot color={dotColor} />}
                    <span className="text-[var(--text-muted)]">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-2" title={tooltip}>
                    {lastRun && (
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {lastRun}
                      </span>
                    )}
                    {row.badge && (
                      <span className="text-xs" style={{ color: row.badge.color }}>
                        {row.badge.text}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Schedule */}
        <Card title={t("settings.schedule")}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.marketInterval")}</span>
              <span className="text-[var(--text-primary)]">
                {config.schedule.collect_interval_minutes} {t("common.minutes")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.newsInterval")}</span>
              <span className="text-[var(--text-primary)]">
                {config.schedule.news_collect_interval_minutes} {t("common.minutes")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.analysisInterval")}</span>
              <span className="text-[var(--text-primary)]">
                {config.schedule.analysis_interval_hours} {t("common.hours")}
              </span>
            </div>
          </div>
        </Card>

        {/* Alert / Telegram */}
        <Card title={t("settings.alerting")}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.alertEnabled")}</span>
              <StatusDot ok={config.alert.enabled} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Telegram</span>
              <StatusDot ok={config.alert.telegram_configured} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.telegramToken")}</span>
              <StatusDot ok={config.alert.telegram_bot_token_set} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t("settings.telegramChatId")}</span>
              <span className="font-mono text-[var(--text-primary)]">
                {config.alert.telegram_chat_id_masked || "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Webhook</span>
              <StatusDot ok={config.alert.webhook_configured} />
            </div>
            <div className="mt-2 space-y-1 border-t border-[var(--border-primary)] pt-2 text-xs">
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>{t("settings.priceThreshold")}</span>
                <span>{config.alert.price_change_pct}%</span>
              </div>
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>{t("settings.sentimentThreshold")}</span>
                <span>{config.alert.sentiment_delta}</span>
              </div>
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>{t("settings.cooldown")}</span>
                <span>
                  {config.alert.cooldown_minutes} {t("common.minutes")}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleSendTest()}
              disabled={testSending || !config.alert.enabled}
              className="mt-2 w-full rounded-md px-3 py-2 text-xs font-medium transition disabled:opacity-50"
              style={{
                backgroundColor: "var(--accent-primary)",
                color: "var(--text-primary)",
              }}
            >
              {testSending ? t("settings.testingAlert") : t("settings.testAlert")}
            </button>
            {testResult && (
              <p className="text-xs text-[var(--text-muted)]">
                {testResult === "sent"
                  ? t("settings.testAlertSent")
                  : testResult === "notConfigured"
                    ? t("settings.testAlertNotConfigured")
                    : t("settings.testAlertFailed")}
              </p>
            )}
            {!config.alert.enabled && (
              <p className="text-xs text-[var(--text-muted)]">{t("settings.alertDisabledHint")}</p>
            )}
            <div className="mt-2 border-t border-[var(--border-primary)] pt-2">
              <button
                type="button"
                onClick={() => setTgLogOpen((v) => !v)}
                className="flex w-full items-center justify-between text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <span>{t("settings.tgLogTitle")}</span>
                <span>{tgLogOpen ? "▾" : "▸"}</span>
              </button>
              {tgLogOpen && (
                <div className="mt-2">
                  <TelegramLogList />
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Data Stats */}
      <Card title={t("settings.dataStats")}>
        <div className="grid grid-cols-5 gap-4">
          {dataStats.map((item) => (
            <div key={item.label}>
              <StatCard label={item.label} value={item.value} />
              {item.last && (
                <p className="mt-1 text-center text-[10px] text-[var(--text-muted)]">
                  {t("settings.lastCollected")}: {item.last}
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t("settings.dbSize")}: {status.database_size}
        </p>
      </Card>

      {/* K-line Data Integrity (matrix view) */}
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

          {/* Selected cell detail (gaps) */}
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

      {/* Scheduler Jobs */}
      {scheduler && (
        <Card title={t("settings.schedulerJobs")}>
          <div className="space-y-2 text-sm">
            <div
              className="flex items-center gap-2 pb-1"
              style={{ borderBottom: "1px solid var(--border-primary)" }}
            >
              <StatusDot ok={scheduler.running} />
              <span className="text-xs text-[var(--text-muted)]">
                {scheduler.running
                  ? t("settings.schedulerRunning")
                  : t("settings.schedulerStopped")}
              </span>
            </div>
            {scheduler.jobs?.map((job) => (
              <div key={job.id} className="flex justify-between">
                <span className="text-[var(--text-muted)]">{job.name}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {t("settings.nextRun")}:{" "}
                  {job.next_run ? new Date(job.next_run).toLocaleString(dateLocale) : "-"}
                </span>
              </div>
            ))}
            {(!scheduler.jobs || scheduler.jobs.length === 0) && (
              <p className="text-[var(--text-muted)]">{t("settings.noJobs")}</p>
            )}
          </div>
        </Card>
      )}

      <p className="text-center text-xs text-[var(--text-muted)]">{t("settings.configNote")}</p>
    </div>
  );
}

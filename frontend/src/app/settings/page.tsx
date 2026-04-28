"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getConfig,
  getSystemStatus,
  getSchedulerStatus,
  getDataIntegrity,
  getPairs,
  sendAlertTest,
  type DataIntegrity,
} from "@/lib/api";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import ErrorBlock from "@/components/ui/ErrorBlock";
import TelegramLogList from "@/components/settings/TelegramLogList";
import { useT } from "@/components/LanguageProvider";

interface AIConfig {
  primary_model: string;
  fallback_model: string;
  fast_model: string;
  has_api_key: boolean;
}

interface DataSourcesConfig {
  has_binance_key: boolean;
}

interface ScheduleConfig {
  collect_interval_minutes: number;
  news_collect_interval_minutes: number;
  analysis_interval_hours: number;
}

interface AppConfig {
  ai: AIConfig;
  data_sources: DataSourcesConfig;
  schedule: ScheduleConfig;
  alert: AlertConfig;
}

interface AlertConfig {
  enabled: boolean;
  telegram_configured: boolean;
  telegram_bot_token_set: boolean;
  telegram_chat_id_masked: string;
  webhook_configured: boolean;
  price_change_pct: number;
  sentiment_delta: number;
  cooldown_minutes: number;
}

interface AIUsage {
  analyses_count: number;
  daily_limit: number;
  total_cost_usd: number;
}

interface CollectorHealth {
  name: string;
  status: string;
  healthy: boolean;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string;
  last_run_at: string | null;
}

interface SystemStatus {
  data_counts: {
    ohlcv: number;
    dex_pairs: number;
    defi_protocols: number;
    news_articles: number;
    analysis_reports: number;
  };
  last_collection: {
    ohlcv: string;
    dex: string;
    defi: string;
    news: string;
    analysis: string;
  };
  ai_usage_today: AIUsage;
  database_size: string;
  collector_health?: CollectorHealth[];
}

interface DataSourceRow {
  label: string;
  collector?: string;
  badge?: { text: string; color: string };
}

interface SchedulerJob {
  id: string;
  name: string;
  next_run: string | null;
}

interface SchedulerStatus {
  jobs?: SchedulerJob[];
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
  const t = useT();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [integrity, setIntegrity] = useState<DataIntegrity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [tgLogOpen, setTgLogOpen] = useState(false);
  const [pairs, setPairs] = useState<string[]>([]);
  const [integritySymbol, setIntegritySymbol] = useState("BTC/USDT");
  const [integrityTimeframe, setIntegrityTimeframe] = useState<"1h" | "4h" | "1d">(
    "1h",
  );
  const [integrityDays, setIntegrityDays] = useState<7 | 30 | 90>(7);
  const [integrityLoading, setIntegrityLoading] = useState(false);

  const loadIntegrity = useMemo(
    () => (symbol: string, timeframe: "1h" | "4h" | "1d", days: 7 | 30 | 90) => {
      setIntegrityLoading(true);
      getDataIntegrity(symbol, timeframe, days)
        .then(setIntegrity)
        .catch(() => setIntegrity(null))
        .finally(() => setIntegrityLoading(false));
    },
    [],
  );

  const loadSettings = () => {
    setError(null);
    Promise.all([getConfig(), getSystemStatus(), getSchedulerStatus()])
      .then(([c, s, sch]) => {
        setConfig(c as unknown as AppConfig);
        setStatus(s as unknown as SystemStatus);
        setScheduler(sch as unknown as SchedulerStatus);
      })
      .catch(() => setError("loadFailed"));
    loadIntegrity(integritySymbol, integrityTimeframe, integrityDays);
    getPairs()
      .then((r) => {
        const all = Object.values(r.pairs).flat();
        const unique = [...new Set(all)].sort();
        setPairs(unique.length > 0 ? unique : ["BTC/USDT"]);
      })
      .catch(() => setPairs(["BTC/USDT"]));
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
    loadIntegrity(integritySymbol, integrityTimeframe, integrityDays);
  }, [integritySymbol, integrityTimeframe, integrityDays, loadIntegrity]);

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

  const dataStats = [
    {
      label: t("settings.klineData"),
      value: status.data_counts.ohlcv.toLocaleString(),
      last: status.last_collection.ohlcv,
    },
    {
      label: t("settings.dexData"),
      value: status.data_counts.dex_pairs.toLocaleString(),
      last: status.last_collection.dex,
    },
    {
      label: t("settings.defiData"),
      value: status.data_counts.defi_protocols.toLocaleString(),
      last: status.last_collection.defi,
    },
    {
      label: t("settings.newsData"),
      value: status.data_counts.news_articles.toLocaleString(),
      last: status.last_collection.news,
    },
    {
      label: t("settings.analysisReports"),
      value: status.data_counts.analysis_reports.toLocaleString(),
      last: status.last_collection.analysis,
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
                ? new Date(health.last_run_at).toLocaleString("zh-CN", {
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
            <StatCard key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {t("settings.dbSize")}: {status.database_size}
        </p>
      </Card>

      {/* Data Integrity */}
      <Card title={t("settings.dataIntegrity")}>
        <div className="space-y-3 text-sm">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={integritySymbol}
              onChange={(e) => setIntegritySymbol(e.target.value)}
              className="rounded border px-2 py-1 text-xs"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
                borderColor: "var(--border-primary)",
              }}
            >
              {pairs.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              {(["1h", "4h", "1d"] as const).map((tf) => {
                const active = integrityTimeframe === tf;
                return (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setIntegrityTimeframe(tf)}
                    className="rounded px-2 py-1 text-xs font-medium transition"
                    style={{
                      backgroundColor: active ? "var(--accent-primary)" : "var(--bg-secondary)",
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
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
            {integrityLoading && (
              <span className="text-xs text-[var(--text-muted)]">{t("common.loading")}</span>
            )}
          </div>

          {!integrity ? (
            <p className="text-[var(--text-muted)]">
              {integrityLoading ? t("common.loading") : t("common.noData")}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">
                  {integrity.symbol} · {integrity.timeframe} · {integrity.days}d
                </span>
                <div className="flex items-center gap-2">
                  <StatusDot
                    color={
                      integrity.completeness_pct >= 95
                        ? "var(--success)"
                        : integrity.completeness_pct >= 80
                          ? "var(--warning)"
                          : "var(--danger)"
                    }
                  />
                  <span className="font-mono text-[var(--text-primary)]">
                    {integrity.completeness_pct}%
                  </span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-[var(--text-muted)]">
                <span>
                  {t("settings.expectedCandles")}: {integrity.expected_candles}
                </span>
                <span>
                  {t("settings.actualCandles")}: {integrity.actual_candles}
                </span>
                <span>
                  {t("settings.gaps")}: {integrity.gap_count}
                </span>
              </div>
              {integrity.gaps.length > 0 && (
                <div
                  className="space-y-1 rounded-lg p-2"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  {integrity.gaps.slice(0, 5).map((g, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-[var(--text-muted)]">
                        {new Date(g.from).toLocaleString("zh-CN")} →{" "}
                        {new Date(g.to).toLocaleString("zh-CN")}
                      </span>
                      <span style={{ color: "var(--danger)" }}>
                        {g.missing_candles} {t("settings.missingCandles")}
                      </span>
                    </div>
                  ))}
                  {integrity.gaps.length > 5 && (
                    <p className="text-xs text-[var(--text-muted)]">
                      ...+{integrity.gaps.length - 5} {t("settings.moreGaps")}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Scheduler Jobs */}
      {scheduler && (
        <Card title={t("settings.schedulerJobs")}>
          <div className="space-y-2 text-sm">
            {scheduler.jobs?.map((job: SchedulerJob) => (
              <div key={job.id} className="flex justify-between">
                <span className="text-[var(--text-muted)]">{job.name}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {t("settings.nextRun")}:{" "}
                  {job.next_run ? new Date(job.next_run).toLocaleString("zh-CN") : "-"}
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

"use client";

import { useEffect, useState } from "react";
import {
  getConfig,
  getSystemStatus,
  getSchedulerStatus,
  getDataIntegrity,
  type DataIntegrity,
} from "@/lib/api";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import ErrorBlock from "@/components/ui/ErrorBlock";
import { useT } from "@/components/LanguageProvider";

interface AIConfig {
  primary_model: string;
  fallback_model: string;
  fast_model: string;
  has_api_key: boolean;
}

interface DataSourcesConfig {
  has_binance_key: boolean;
  has_cryptopanic_key: boolean;
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

  const loadSettings = () => {
    setError(null);
    Promise.all([getConfig(), getSystemStatus(), getSchedulerStatus()])
      .then(([c, s, sch]) => {
        setConfig(c as unknown as AppConfig);
        setStatus(s as unknown as SystemStatus);
        setScheduler(sch as unknown as SchedulerStatus);
      })
      .catch(() => setError("loadFailed"));
    getDataIntegrity("BTC/USDT", "1h", 7)
      .then(setIntegrity)
      .catch(() => {});
  };

  useEffect(() => {
    queueMicrotask(() => loadSettings());
  }, []);

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

        {/* Data Sources */}
        <Card title={t("settings.dataSources")}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Binance API Key</span>
              <StatusDot ok={config.data_sources.has_binance_key} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">CryptoPanic Key</span>
              <StatusDot ok={config.data_sources.has_cryptopanic_key} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">CoinGecko</span>
              <span className="text-xs" style={{ color: "var(--success)" }}>
                {t("common.free")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">DexScreener</span>
              <span className="text-xs" style={{ color: "var(--success)" }}>
                {t("common.free")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">DefiLlama</span>
              <span className="text-xs" style={{ color: "var(--success)" }}>
                {t("common.free")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">RSS Feeds</span>
              <span className="text-xs" style={{ color: "var(--success)" }}>
                {t("common.free")}
              </span>
            </div>
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

      {/* Collector Health */}
      {status.collector_health && status.collector_health.length > 0 && (
        <Card title={t("settings.collectorHealth")}>
          <div className="space-y-2 text-sm">
            {status.collector_health.map((c: CollectorHealth) => (
              <div key={c.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot color={healthColor(c.status)} />
                  <span className="font-mono text-[var(--text-primary)]">{c.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  {c.consecutive_failures > 0 && (
                    <span className="text-xs" style={{ color: "var(--danger)" }}>
                      {t("settings.failures")}: {c.consecutive_failures}
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-muted)]">
                    {c.last_run_at ? new Date(c.last_run_at).toLocaleString("zh-CN") : "-"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Data Integrity */}
      {integrity && (
        <Card title={t("settings.dataIntegrity")}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">
                {integrity.symbol} · {integrity.timeframe} · {t("settings.lastDays")}
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
          </div>
        </Card>
      )}

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

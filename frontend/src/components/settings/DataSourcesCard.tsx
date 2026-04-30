"use client";

import Card from "@/components/ui/Card";
import { StatusDot, healthColor, healthLabel } from "./shared";
import { useLanguage } from "@/components/LanguageProvider";
import type { AppConfig, SystemStatus, CollectorHealth } from "@/lib/api";

interface DataSourceRow {
  label: string;
  collector?: string;
  badge?: { text: string; color: string };
}

const dataSourceRows: DataSourceRow[] = [
  { label: "Binance API Key" },
  { label: "Binance OHLCV", collector: "cex" },
  { label: "Binance Futures", collector: "futures" },
  { label: "CoinGecko", collector: "coingecko" },
  { label: "DexScreener", collector: "dexscreener" },
  { label: "DefiLlama", collector: "defillama" },
  { label: "Fear & Greed", collector: "fear_greed" },
  { label: "News (RSS + CoinGecko)", collector: "news" },
  { label: "NewsAPI", collector: "newsapi" },
];

const freeCollectors = new Set(["coingecko", "dexscreener", "defillama", "fear_greed", "news", "newsapi"]);

export default function DataSourcesCard({
  config,
  status,
}: {
  config: AppConfig;
  status: SystemStatus;
}) {
  const { t, locale } = useLanguage();
  const dateLocale = locale === "zh" ? "zh-CN" : "en-US";

  const healthByName: Record<string, CollectorHealth> = {};
  for (const h of status.collector_health ?? []) {
    healthByName[h.name] = h;
  }

  const rows = dataSourceRows.map((row) => {
    if (freeCollectors.has(row.collector ?? "")) {
      return { ...row, badge: { text: t("common.free"), color: "var(--success)" } };
    }
    if (!row.collector) {
      return {
        ...row,
        badge: {
          text: config.data_sources.has_binance_key ? t("settings.dsConfigured") : "—",
          color: config.data_sources.has_binance_key ? "var(--success)" : "var(--text-muted)",
        },
      };
    }
    return row;
  });

  return (
    <Card title={t("settings.dataSources")}>
      <div className="space-y-1.5 text-sm">
        {rows.map((row) => {
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
            ? `${healthLabel(health.status, t)}${
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
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      color: row.badge.color,
                      border: `1px solid color-mix(in srgb, ${row.badge.color} 30%, transparent)`,
                      backgroundColor: `color-mix(in srgb, ${row.badge.color} 8%, transparent)`,
                    }}
                  >
                    {row.badge.text}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

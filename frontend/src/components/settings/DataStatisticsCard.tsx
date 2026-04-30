"use client";

import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import { useLanguage } from "@/components/LanguageProvider";
import type { SystemStatus } from "@/lib/api";

function formatRelativeTime(iso: string | null, t: (key: string) => string) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t("common.justNow");
  if (mins < 60) return t("common.minutesAgo").replace("{n}", String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("common.hoursAgo").replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  return t("common.daysAgo").replace("{n}", String(days));
}

export default function DataStatisticsCard({ status }: { status: SystemStatus }) {
  const { t } = useLanguage();

  const dataStats = [
    {
      label: t("settings.klineData"),
      value: status.data_counts.ohlcv.toLocaleString(),
      last: formatRelativeTime(status.last_collection.ohlcv, t),
    },
    {
      label: t("settings.dexData"),
      value: status.data_counts.dex_pairs.toLocaleString(),
      last: formatRelativeTime(status.last_collection.dex, t),
    },
    {
      label: t("settings.defiData"),
      value: status.data_counts.defi_protocols.toLocaleString(),
      last: formatRelativeTime(status.last_collection.defi, t),
    },
    {
      label: t("settings.newsData"),
      value: status.data_counts.news_articles.toLocaleString(),
      last: formatRelativeTime(status.last_collection.news, t),
    },
    {
      label: t("settings.analysisReports"),
      value: status.data_counts.analysis_reports.toLocaleString(),
      last: formatRelativeTime(status.last_collection.analysis, t),
    },
  ];

  return (
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
  );
}

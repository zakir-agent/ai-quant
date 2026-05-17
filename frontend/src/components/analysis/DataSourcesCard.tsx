"use client";

import Card from "@/components/ui/Card";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

interface Props {
  report: AnalysisReport;
}

const SOURCES = [
  { key: "market_overview", labelKey: "analysis.dsMarketOverview" },
  { key: "futures_data", labelKey: "analysis.dsFuturesData" },
  { key: "dex_volume", labelKey: "analysis.dsDexVolume" },
] as const;

export default function DataSourcesCard({ report }: Props) {
  const t = useT();
  const ds = report.data_sources_summary;

  if (!ds) return null;

  return (
    <Card title={t("analysis.dataSources")}>
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((src) =>
          ds[src.key as keyof typeof ds] ? (
            <span key={src.key} className="rounded-full bg-[var(--bg-card-hover)] px-2 py-0.5 text-xs">
              {t(src.labelKey)}
            </span>
          ) : null,
        )}
        {ds.fear_greed_index != null && (
          <span className="rounded-full bg-[var(--bg-card-hover)] px-2 py-0.5 text-xs">
            {t("analysis.dsFearGreed")}: {ds.fear_greed_index}
          </span>
        )}
        {ds.news_count > 0 && (
          <span className="rounded-full bg-[var(--bg-card-hover)] px-2 py-0.5 text-xs">
            {t("analysis.dsNewsCount").replace("{n}", String(ds.news_count))}
          </span>
        )}
      </div>
    </Card>
  );
}

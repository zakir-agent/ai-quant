"use client";

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
    <div className="rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4">
      <p className="mb-2 text-xs text-neutral-500">{t("analysis.dataSources")}</p>
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((src) =>
          ds[src.key as keyof typeof ds] ? (
            <span key={src.key} className="rounded-full bg-white/8 px-2 py-0.5 text-xs">
              {t(src.labelKey)}
            </span>
          ) : null,
        )}
        {ds.fear_greed_index != null && (
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs">
            {t("analysis.dsFearGreed")}: {ds.fear_greed_index}
          </span>
        )}
        {ds.news_count > 0 && (
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs">
            {t("analysis.dsNewsCount").replace("{n}", String(ds.news_count))}
          </span>
        )}
      </div>
    </div>
  );
}

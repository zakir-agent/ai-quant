"use client";

import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import { sentimentColor } from "@/lib/analysis-helpers";

interface Props {
  reports: AnalysisReport[];
  onClick?: () => void;
}

export default function CompareCard({ reports, onClick }: Props) {
  const t = useT();

  if (reports.length < 2) {
    return (
      <div className="col-span-3 rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4">
        <p className="text-xs text-neutral-500">{t("analysis.compare")}</p>
        <p className="mt-2 text-xs text-neutral-500">{t("analysis.noData")}</p>
      </div>
    );
  }

  const old = reports[1];
  const latest = reports[0];
  const sentimentDiff = latest.sentiment_score - old.sentiment_score;
  const trendChanged = latest.trend !== old.trend;

  return (
    <div
      className="col-span-3 cursor-pointer rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4 transition-all hover:-translate-y-0.5 hover:border-white/12"
      onClick={onClick}
    >
      <p className="mb-3 text-xs text-neutral-500">{t("analysis.compare")}</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-md bg-white/3 p-3">
          <p className="text-xs text-neutral-500">
            {new Date(old.created_at).toLocaleDateString()}
          </p>
          <p
            className="mt-1 text-lg font-bold"
            style={{ color: sentimentColor(old.sentiment_score) }}
          >
            {old.sentiment_score}
          </p>
          <p className="text-xs">{old.trend}</p>
        </div>
        <div className="rounded-md bg-white/3 p-3">
          <p className="text-xs text-neutral-500">
            {new Date(latest.created_at).toLocaleDateString()}
          </p>
          <p
            className="mt-1 text-lg font-bold"
            style={{ color: sentimentColor(latest.sentiment_score) }}
          >
            {latest.sentiment_score}
          </p>
          <p className="text-xs">{latest.trend}</p>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        {Math.abs(sentimentDiff) > 20 && (
          <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
            {t("analysis.significantChange")} ({sentimentDiff > 0 ? "+" : ""}
            {sentimentDiff})
          </span>
        )}
        {trendChanged && (
          <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
            {t("analysis.trendReversal")}
          </span>
        )}
      </div>
    </div>
  );
}

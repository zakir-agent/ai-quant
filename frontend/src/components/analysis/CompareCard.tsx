"use client";

import Card from "@/components/ui/Card";
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
      <Card title={t("analysis.compare")} className="col-span-full">
        <p className="text-xs text-[var(--text-muted)]">{t("analysis.noData")}</p>
      </Card>
    );
  }

  const old = reports[1];
  const latest = reports[0];
  const sentimentDiff = latest.sentiment_score - old.sentiment_score;
  const trendChanged = latest.trend !== old.trend;

  return (
    <Card title={t("analysis.compare")} className="col-span-full cursor-pointer" onClick={onClick}>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-md bg-[var(--bg-card-hover)] p-3">
          <p className="text-xs text-[var(--text-muted)]">
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
        <div className="rounded-md bg-[var(--bg-card-hover)] p-3">
          <p className="text-xs text-[var(--text-muted)]">
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
    </Card>
  );
}

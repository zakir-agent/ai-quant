"use client";

import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import { trendLabel, sentimentColor } from "@/lib/analysis-helpers";
import SentimentGauge from "./SentimentGauge";

interface Props {
  report: AnalysisReport;
  onClick?: () => void;
}

export default function SentimentCard({ report, onClick }: Props) {
  const t = useT();

  return (
    <div
      className="cursor-pointer rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4 transition-all hover:border-white/12 hover:-translate-y-0.5"
      onClick={onClick}
    >
      <p className="mb-2 text-xs text-neutral-500">{t("analysis.title")}</p>
      <div className="flex items-center justify-between">
        <div>
          <p
            className="text-3xl font-bold"
            style={{ color: sentimentColor(report.sentiment_score) }}
          >
            {report.sentiment_score > 0 ? "+" : ""}
            {report.sentiment_score}
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: sentimentColor(report.sentiment_score) }}
          >
            {trendLabel(report.trend, t)}
          </p>
        </div>
        <SentimentGauge score={report.sentiment_score} size={100} />
      </div>
    </div>
  );
}

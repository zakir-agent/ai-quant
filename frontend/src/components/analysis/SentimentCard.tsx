"use client";

import Card from "@/components/ui/Card";
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
    <Card title={t("analysis.sentimentScore")} className="cursor-pointer" onClick={onClick}>
      <div className="flex items-center justify-between">
        <div>
          <p
            className="text-3xl font-bold"
            style={{ color: sentimentColor(report.sentiment_score) }}
          >
            {report.sentiment_score > 0 ? "+" : ""}
            {report.sentiment_score}
          </p>
          <p className="mt-1 text-xs" style={{ color: sentimentColor(report.sentiment_score) }}>
            {trendLabel(report.trend, t)}
          </p>
        </div>
        <SentimentGauge score={report.sentiment_score} size={100} />
      </div>
    </Card>
  );
}

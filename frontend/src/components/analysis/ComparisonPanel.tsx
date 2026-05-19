"use client";

import React from "react";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import { sentimentColor, trendLabel, riskLabel } from "@/lib/analysis-helpers";

interface ComparisonPanelProps {
  reportA: AnalysisReport;
  reportB: AnalysisReport;
}

interface DiffRowProps {
  label: string;
  valueA: string;
  valueB: string;
  changed: boolean;
  colorA?: string;
  colorB?: string;
}

function DiffRow({ label, valueA, valueB, changed, colorA, colorB }: DiffRowProps) {
  const t = useT();
  return (
    <div className="flex items-center justify-between rounded-md px-3 py-2 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <div className="flex items-center gap-4">
        <span style={{ color: colorA }} className="min-w-[60px] text-right">
          {valueA}
        </span>
        <span className="text-[var(--text-muted)]">→</span>
        <span style={{ color: colorB }} className="min-w-[60px]">
          {valueB}
        </span>
        {changed && (
          <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">
            {t("analysis.diffChanged")}
          </span>
        )}
      </div>
    </div>
  );
}

function ComparisonPanelInner({ reportA, reportB }: ComparisonPanelProps) {
  const t = useT();

  const sentimentDiff = reportB.sentiment_score - reportA.sentiment_score;
  const trendChanged = reportA.trend !== reportB.trend;
  const riskChanged = reportA.risk_level !== reportB.risk_level;

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] p-3">
        <div className="flex-1 text-center">
          <div className="text-[10px] text-[var(--text-muted)]">{t("analysis.reportA")}</div>
          <div className="text-xs text-[var(--text-secondary)]">
            {formatDateTime(reportA.created_at)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-[var(--text-muted)]">{t("analysis.sentimentDelta")}</div>
          <div
            className="text-lg font-bold"
            style={{ color: sentimentColor(reportB.sentiment_score) }}
          >
            {sentimentDiff > 0 ? "+" : ""}
            {sentimentDiff}
          </div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-[10px] text-[var(--text-muted)]">{t("analysis.reportB")}</div>
          <div className="text-xs text-[var(--text-secondary)]">
            {formatDateTime(reportB.created_at)}
          </div>
        </div>
      </div>

      <div className="space-y-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] p-2">
        <DiffRow
          label={t("analysis.summary")}
          valueA={reportA.sentiment_score.toString()}
          valueB={reportB.sentiment_score.toString()}
          changed={Math.abs(sentimentDiff) > 10}
          colorA={sentimentColor(reportA.sentiment_score)}
          colorB={sentimentColor(reportB.sentiment_score)}
        />
        <DiffRow
          label={t("analysis.bullish")}
          valueA={trendLabel(reportA.trend, t)}
          valueB={trendLabel(reportB.trend, t)}
          changed={trendChanged}
        />
        <DiffRow
          label={t("analysis.riskLow")}
          valueA={riskLabel(reportA.risk_level, t)}
          valueB={riskLabel(reportB.risk_level, t)}
          changed={riskChanged}
        />
      </div>
    </div>
  );
}

const ComparisonPanel = React.memo(ComparisonPanelInner);
export default ComparisonPanel;

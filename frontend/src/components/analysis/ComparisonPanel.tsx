"use client";

import React from "react";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import SentimentCard from "./SentimentCard";
import RiskCard from "./RiskCard";
import RecommendationCard from "./RecommendationCard";
import TechnicalCard from "./TechnicalCard";
import ObservationsCard from "./ObservationsCard";
import {
  sentimentColor,
  trendLabel,
  riskLabel,
  riskVariant,
  formatTimeSpan,
} from "@/lib/analysis-helpers";

interface ComparisonPanelProps {
  reportA: AnalysisReport;
  reportB: AnalysisReport;
}

function DiffBadge({ changed }: { changed: boolean }) {
  const t = useT();
  if (!changed) return null;
  return (
    <span
      className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: "color-mix(in srgb, var(--warning) 15%, transparent)",
        color: "var(--warning)",
      }}
    >
      {t("analysis.diffChanged")}
    </span>
  );
}

function SummaryBar({ reportA, reportB }: { reportA: AnalysisReport; reportB: AnalysisReport }) {
  const t = useT();
  const sentimentDiff = reportB.sentiment_score - reportA.sentiment_score;
  const trendChanged = reportB.trend !== reportA.trend;
  const riskChanged = reportB.risk_level !== reportA.risk_level;

  return (
    <Card title={t("analysis.comparisonSummary")} className="col-span-full">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">{t("analysis.sentimentDelta")}</span>
          <span
            className="font-mono text-sm font-bold"
            style={{
              color:
                sentimentDiff > 0
                  ? "var(--success)"
                  : sentimentDiff < 0
                    ? "var(--danger)"
                    : "var(--text-muted)",
            }}
          >
            {sentimentDiff > 0 ? "+" : ""}
            {sentimentDiff}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">{t("analysis.trend")}</span>
          <span style={{ color: sentimentColor(reportA.sentiment_score) }}>
            {trendLabel(reportA.trend, t)}
          </span>
          <span className="text-[var(--text-muted)]">→</span>
          <span style={{ color: sentimentColor(reportB.sentiment_score) }}>
            {trendLabel(reportB.trend, t)}
          </span>
          {trendChanged && <DiffBadge changed />}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Risk</span>
          <Badge variant={riskVariant(reportA.risk_level)} size="sm">
            {riskLabel(reportA.risk_level, t)}
          </Badge>
          <span className="text-[var(--text-muted)]">→</span>
          <Badge variant={riskVariant(reportB.risk_level)} size="sm">
            {riskLabel(reportB.risk_level, t)}
          </Badge>
          {riskChanged && <DiffBadge changed />}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">{t("analysis.timeSpan")}</span>
          <span className="text-sm text-[var(--text-secondary)]">
            {formatTimeSpan(reportA.created_at, reportB.created_at, t)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function ComparisonPanelInner({ reportA, reportB }: ComparisonPanelProps) {
  const t = useT();
  const sentimentChanged = reportA.sentiment_score !== reportB.sentiment_score;
  const riskChanged = reportA.risk_level !== reportB.risk_level;
  const techChanged =
    JSON.stringify(reportA.technical_analysis) !== JSON.stringify(reportB.technical_analysis);

  return (
    <div className="space-y-4">
      <SummaryBar reportA={reportA} reportB={reportB} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase">
            {t("analysis.reportA")} — {new Date(reportA.created_at).toLocaleString()}
          </div>
          {sentimentChanged ? (
            <div className="rounded-xl border border-[var(--warning)]/30 p-1">
              <SentimentCard report={reportA} />
            </div>
          ) : (
            <SentimentCard report={reportA} />
          )}
          {riskChanged ? (
            <div className="relative">
              <RiskCard report={reportA} />
              <DiffBadge changed />
            </div>
          ) : (
            <RiskCard report={reportA} />
          )}
          <RecommendationCard report={reportA} />
          {techChanged ? (
            <div className="rounded-xl border border-[var(--warning)]/30 p-1">
              <TechnicalCard report={reportA} />
            </div>
          ) : (
            <TechnicalCard report={reportA} />
          )}
          <ObservationsCard report={reportA} />
        </div>

        <div className="space-y-4">
          <div className="mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase">
            {t("analysis.reportB")} — {new Date(reportB.created_at).toLocaleString()}
          </div>
          {sentimentChanged ? (
            <div className="rounded-xl border border-[var(--warning)]/30 p-1">
              <SentimentCard report={reportB} />
            </div>
          ) : (
            <SentimentCard report={reportB} />
          )}
          {riskChanged ? (
            <div className="relative">
              <RiskCard report={reportB} />
              <DiffBadge changed />
            </div>
          ) : (
            <RiskCard report={reportB} />
          )}
          <RecommendationCard report={reportB} />
          {techChanged ? (
            <div className="rounded-xl border border-[var(--warning)]/30 p-1">
              <TechnicalCard report={reportB} />
            </div>
          ) : (
            <TechnicalCard report={reportB} />
          )}
          <ObservationsCard report={reportB} />
        </div>
      </div>
    </div>
  );
}

const ComparisonPanel = React.memo(ComparisonPanelInner);
export default ComparisonPanel;

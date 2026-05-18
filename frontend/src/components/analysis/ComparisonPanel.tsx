"use client";

import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import {
  sentimentColor,
  trendLabel,
  riskLabel,
  riskVariant,
  formatTimeSpan,
} from "@/lib/analysis-helpers";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import SentimentCard from "./SentimentCard";
import RiskCard from "./RiskCard";
import RecommendationCard from "./RecommendationCard";
import TechnicalCard from "./TechnicalCard";
import ObservationsCard from "./ObservationsCard";

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

function MaybeHighlight({
  highlight,
  children,
}: {
  highlight: boolean;
  children: React.ReactNode;
}) {
  if (!highlight) return <>{children}</>;
  return <div className="rounded-xl border border-[var(--warning)]/30 p-1">{children}</div>;
}

function SummaryBar({ reportA, reportB }: { reportA: AnalysisReport; reportB: AnalysisReport }) {
  const t = useT();
  const sentimentDiff = reportB.sentiment_score - reportA.sentiment_score;
  const trendChanged = reportB.trend !== reportA.trend;
  const riskChanged = reportB.risk_level !== reportA.risk_level;
  const spanText = formatTimeSpan(reportA.created_at, reportB.created_at, t);

  const deltaColor =
    sentimentDiff > 0
      ? "var(--success)"
      : sentimentDiff < 0
        ? "var(--danger)"
        : "var(--text-muted)";

  return (
    <Card title={t("analysis.comparisonSummary")} className="col-span-full">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">{t("analysis.sentimentDelta")}</span>
          <span className="font-mono text-sm font-bold" style={{ color: deltaColor }}>
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
          <span className="text-xs text-[var(--text-muted)]">{t("analysis.riskWarnings")}</span>
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
          <span className="text-sm text-[var(--text-secondary)]">{spanText}</span>
        </div>
      </div>
    </Card>
  );
}

function ReportColumn({
  report,
  label,
  sentimentChanged,
  riskChanged,
  techChanged,
}: {
  report: AnalysisReport;
  label: string;
  sentimentChanged: boolean;
  riskChanged: boolean;
  techChanged: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase">
        {label} — {new Date(report.created_at).toLocaleString()}
      </div>
      <MaybeHighlight highlight={sentimentChanged}>
        <SentimentCard report={report} />
      </MaybeHighlight>
      {riskChanged ? (
        <div className="relative">
          <RiskCard report={report} />
          <DiffBadge changed />
        </div>
      ) : (
        <RiskCard report={report} />
      )}
      <RecommendationCard report={report} />
      <MaybeHighlight highlight={techChanged}>
        <TechnicalCard report={report} />
      </MaybeHighlight>
      <ObservationsCard report={report} />
    </div>
  );
}

export default function ComparisonPanel({ reportA, reportB }: ComparisonPanelProps) {
  const t = useT();
  const sentimentChanged = reportA.sentiment_score !== reportB.sentiment_score;
  const riskChanged = reportA.risk_level !== reportB.risk_level;
  const techChanged =
    JSON.stringify(reportA.technical_analysis) !== JSON.stringify(reportB.technical_analysis);

  return (
    <div className="space-y-4">
      <SummaryBar reportA={reportA} reportB={reportB} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportColumn
          report={reportA}
          label={t("analysis.reportA")}
          sentimentChanged={sentimentChanged}
          riskChanged={riskChanged}
          techChanged={techChanged}
        />
        <ReportColumn
          report={reportB}
          label={t("analysis.reportB")}
          sentimentChanged={sentimentChanged}
          riskChanged={riskChanged}
          techChanged={techChanged}
        />
      </div>
    </div>
  );
}

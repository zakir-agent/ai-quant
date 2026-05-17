"use client";

import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import { riskVariant, riskLabel } from "@/lib/analysis-helpers";

interface Props {
  report: AnalysisReport;
  onClick?: () => void;
}

export default function RiskCard({ report, onClick }: Props) {
  const t = useT();

  return (
    <Card title={t("analysis.riskWarnings")} className="cursor-pointer" onClick={onClick}>
      <Badge variant={riskVariant(report.risk_level)}>{riskLabel(report.risk_level, t)}</Badge>
      {report.risk_warnings && report.risk_warnings.length > 0 && (
        <p className="mt-2 line-clamp-2 text-xs text-[var(--text-secondary)]">
          {report.risk_warnings[0]}
        </p>
      )}
    </Card>
  );
}

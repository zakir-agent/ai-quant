"use client";

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
    <div
      className="cursor-pointer rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4 transition-all hover:-translate-y-0.5 hover:border-white/12"
      onClick={onClick}
    >
      <p className="mb-2 text-xs text-neutral-500">{t("analysis.riskWarnings")}</p>
      <Badge variant={riskVariant(report.risk_level)}>{riskLabel(report.risk_level, t)}</Badge>
      {report.risk_warnings && report.risk_warnings.length > 0 && (
        <p className="mt-2 line-clamp-2 text-xs text-neutral-400">{report.risk_warnings[0]}</p>
      )}
    </div>
  );
}

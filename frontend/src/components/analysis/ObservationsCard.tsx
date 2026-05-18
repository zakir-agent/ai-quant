"use client";

import Card from "@/components/ui/Card";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

interface ObservationsCardProps {
  report: AnalysisReport;
}

export default function ObservationsCard({ report }: ObservationsCardProps) {
  const t = useT();
  const hasObservations =
    report.key_observations && report.key_observations.length > 0;
  const hasWarnings =
    report.risk_warnings && report.risk_warnings.length > 0;

  if (!hasObservations && !hasWarnings) return null;

  return (
    <Card title={t("analysis.keyObservations")} className="col-span-full">
      <div className="space-y-4">
        {hasObservations && (
          <ul className="space-y-1">
            {report.key_observations!.map((obs, i) => (
              <li key={i} className="text-sm text-[var(--text-secondary)]">
                • {obs}
              </li>
            ))}
          </ul>
        )}

        {hasWarnings && (
          <div>
            <h4 className="mb-1 text-xs font-semibold text-[var(--text-muted)] uppercase">
              {t("analysis.riskWarnings")}
            </h4>
            <ul className="space-y-1">
              {report.risk_warnings!.map((w, i) => (
                <li key={i} className="text-sm" style={{ color: "var(--danger)" }}>
                  • {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.token_usage && (
          <div className="text-xs text-[var(--text-muted)]">
            {report.model_used} · {t("analysis.tokens")}:{" "}
            {report.token_usage.input + report.token_usage.output} ·{" "}
            {t("analysis.cost")}: ${report.token_usage.cost_usd.toFixed(4)}
          </div>
        )}
      </div>
    </Card>
  );
}

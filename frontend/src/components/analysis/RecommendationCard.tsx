"use client";

import Badge from "@/components/ui/Badge";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import { actionColor, actionLabel, confidenceLabel } from "@/lib/analysis-helpers";

interface Props {
  report: AnalysisReport;
  onClick?: () => void;
}

export default function RecommendationCard({ report, onClick }: Props) {
  const t = useT();
  const recs = report.recommendations || [];

  return (
    <div
      className="col-span-3 cursor-pointer rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4 transition-all hover:-translate-y-0.5 hover:border-white/12"
      onClick={onClick}
    >
      <p className="mb-3 text-xs text-neutral-500">{t("analysis.recommendations")}</p>
      {recs.length === 0 ? (
        <p className="text-xs text-neutral-500">{t("analysis.noData")}</p>
      ) : (
        <div className="space-y-2">
          {recs.map((rec, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md bg-white/3 px-3 py-2">
              <span className="text-sm font-semibold" style={{ color: actionColor(rec.action) }}>
                {rec.symbol || "—"}
              </span>
              <Badge
                variant={
                  rec.action === "buy" ? "success" : rec.action === "sell" ? "danger" : "warning"
                }
              >
                {actionLabel(rec.action, t)}
              </Badge>
              {rec.target_price && (
                <span className="text-xs text-neutral-400">
                  {t("analysis.target")}: {rec.target_price}
                </span>
              )}
              {rec.stop_loss && (
                <span className="text-xs text-neutral-400">
                  {t("analysis.stopLoss")}: {rec.stop_loss}
                </span>
              )}
              <span className="ml-auto text-xs text-neutral-500">
                {confidenceLabel(rec.confidence, t)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

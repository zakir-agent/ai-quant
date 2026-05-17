"use client";

import Card from "@/components/ui/Card";
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
    <Card
      title={t("analysis.recommendations")}
      className="col-span-full cursor-pointer"
      onClick={onClick}
    >
      {recs.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{t("analysis.noData")}</p>
      ) : (
        <div className="space-y-2">
          {recs.map((rec, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-md bg-[var(--bg-card-hover)] px-3 py-2"
            >
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
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("analysis.target")}: {rec.target_price}
                </span>
              )}
              {rec.stop_loss && (
                <span className="text-xs text-[var(--text-secondary)]">
                  {t("analysis.stopLoss")}: {rec.stop_loss}
                </span>
              )}
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {confidenceLabel(rec.confidence, t)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

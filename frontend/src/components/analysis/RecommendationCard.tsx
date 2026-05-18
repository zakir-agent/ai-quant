"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import { actionColor, actionLabel, confidenceLabel } from "@/lib/analysis-helpers";

interface Props {
  report: AnalysisReport;
}

const rowCls =
  "flex items-center gap-3 rounded-md bg-[var(--bg-card-hover)] px-3 py-2 transition-colors hover:brightness-110";

export default function RecommendationCard({ report }: Props) {
  const t = useT();
  const recs = report.recommendations || [];

  return (
    <Card title={t("analysis.recommendations")} className="col-span-full">
      {recs.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{t("analysis.noData")}</p>
      ) : (
        <div className="space-y-2">
          {recs.map((rec, i) => {
            const inner = (
              <>
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
              </>
            );

            if (rec.symbol) {
              return (
                <Link
                  key={i}
                  href={`/analysis?symbol=${encodeURIComponent(rec.symbol)}`}
                  className={`${rowCls} cursor-pointer`}
                >
                  {inner}
                </Link>
              );
            }

            return (
              <div key={i} className={rowCls}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

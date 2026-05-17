"use client";

import Card from "@/components/ui/Card";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import Badge from "@/components/ui/Badge";

interface Props {
  report: AnalysisReport;
  onClick?: () => void;
}

function MiniTrendBadge({ label, trend }: { label: string; trend: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <Badge variant={trend === "up" ? "success" : trend === "down" ? "danger" : "warning"}>
        {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
      </Badge>
    </div>
  );
}

export default function TechnicalCard({ report, onClick }: Props) {
  const t = useT();
  const ta = report.technical_analysis;

  if (!ta) {
    return (
      <Card title={t("analysis.technicalAnalysis")} className="col-span-full">
        <p className="text-xs text-[var(--text-muted)]">{t("analysis.noData")}</p>
      </Card>
    );
  }

  return (
    <Card
      title={t("analysis.technicalAnalysis")}
      className="col-span-full cursor-pointer"
      onClick={onClick}
    >
      <div className="grid grid-cols-3 gap-4">
        <MiniTrendBadge label="1H" trend={ta.trend_1h} />
        <MiniTrendBadge label="4H" trend={ta.trend_4h} />
        <MiniTrendBadge label="1D" trend={ta.trend_1d} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
        <div>
          <span className="text-[var(--text-muted)]">{t("analysis.support")}: </span>
          <span>{ta.support_levels?.join(", ") || "—"}</span>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">{t("analysis.resistance")}: </span>
          <span>{ta.resistance_levels?.join(", ") || "—"}</span>
        </div>
      </div>
      {ta.key_observation && (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">{ta.key_observation}</p>
      )}
    </Card>
  );
}

"use client";

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
      <span className="text-xs text-neutral-500">{label}</span>
      <Badge
        variant={
          trend === "up" ? "success" : trend === "down" ? "danger" : "warning"
        }
      >
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
      <div className="col-span-3 rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4">
        <p className="text-xs text-neutral-500">
          {t("analysis.technicalAnalysis")}
        </p>
        <p className="mt-2 text-xs text-neutral-500">{t("analysis.noData")}</p>
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4 transition-all hover:border-white/12 hover:-translate-y-0.5 col-span-3"
      onClick={onClick}
    >
      <p className="mb-3 text-xs text-neutral-500">
        {t("analysis.technicalAnalysis")}
      </p>
      <div className="grid grid-cols-3 gap-4">
        <MiniTrendBadge label="1H" trend={ta.trend_1h} />
        <MiniTrendBadge label="4H" trend={ta.trend_4h} />
        <MiniTrendBadge label="1D" trend={ta.trend_1d} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
        <div>
          <span className="text-neutral-500">
            {t("analysis.support")}:{" "}
          </span>
          <span>{ta.support_levels?.join(", ") || "—"}</span>
        </div>
        <div>
          <span className="text-neutral-500">
            {t("analysis.resistance")}:{" "}
          </span>
          <span>{ta.resistance_levels?.join(", ") || "—"}</span>
        </div>
      </div>
      {ta.key_observation && (
        <p className="mt-2 text-xs text-neutral-400">{ta.key_observation}</p>
      )}
    </div>
  );
}

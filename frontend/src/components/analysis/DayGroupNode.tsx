"use client";

import React from "react";
import { sentimentColor } from "@/lib/analysis-helpers";
import { useT } from "@/components/LanguageProvider";
import type { DayGroup } from "@/hooks/useAnalysisTimeline";

interface DayGroupNodeProps {
  group: DayGroup;
  isExpanded: boolean;
  onClick: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function DayGroupNodeInner({ group, isExpanded, onClick }: DayGroupNodeProps) {
  const t = useT();
  const color = sentimentColor(group.avgSentiment);

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-1 rounded-lg border border-dashed border-[var(--border-primary)] px-3 py-2 transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-card-hover)]"
      title={isExpanded ? t("analysis.collapseDay") : t("analysis.expandDay")}
    >
      <span className="text-[10px] text-[var(--text-muted)]">{formatDate(group.date)}</span>

      <div
        className="relative flex h-6 w-6 items-center justify-center rounded-full font-bold text-black"
        style={{ backgroundColor: color }}
      >
        {group.reports.length}
      </div>

      <span className="text-[9px] text-[var(--text-muted)]">
        {t("analysis.avgSentiment")}: {group.avgSentiment > 0 ? "+" : ""}{group.avgSentiment}
      </span>
    </button>
  );
}

const DayGroupNode = React.memo(DayGroupNodeInner);
export default DayGroupNode;

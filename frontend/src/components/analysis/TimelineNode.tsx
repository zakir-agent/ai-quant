"use client";

import React from "react";
import { sentimentColor, riskLabel, trendIcon } from "@/lib/analysis-helpers";
import { useT } from "@/components/LanguageProvider";
import type { AnalysisReport } from "@/lib/api";

interface TimelineNodeProps {
  report: AnalysisReport;
  isSelected: boolean;
  selectionOrder: number;
  onClick: () => void;
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TimelineNodeInner({
  report,
  isSelected,
  selectionOrder,
  onClick,
}: TimelineNodeProps) {
  const t = useT();
  const color = sentimentColor(report.sentiment_score);
  const scoreSign = report.sentiment_score > 0 ? "+" : "";
  const formattedScore = `${scoreSign}${report.sentiment_score}`;

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center gap-0.5 outline-none"
      title={`${formatTime(report.created_at)} — ${report.sentiment_score} ${report.trend}`}
    >
      <span
        className="text-[10px] font-semibold tabular-nums leading-none"
        style={{ color }}
      >
        {formattedScore}
      </span>

      <span className="text-[10px] leading-none text-[var(--text-muted)]">
        {trendIcon(report.trend)}
      </span>

      <div
        className={`relative flex items-center justify-center rounded-full transition-all duration-200 ${
          isSelected
            ? "h-6 w-6 border-[3px] border-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)]"
            : "h-5 w-5 border-2 border-[var(--bg-card)] group-hover:scale-110"
        }`}
        style={{ backgroundColor: color }}
      >
        {isSelected && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[8px] font-bold text-black">
            {selectionOrder}
          </span>
        )}
      </div>

      <span className="text-[9px] leading-none text-[var(--text-muted)]">
        {formatTime(report.created_at)}
      </span>

      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] px-2.5 py-1.5 text-[10px] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
        <div className="font-medium text-[var(--text-primary)]">
          {new Date(report.created_at).toLocaleDateString()} {formatTime(report.created_at)}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span style={{ color }} className="font-semibold">
            {formattedScore}
          </span>
          <span className="text-[var(--text-muted)]">{report.trend}</span>
        </div>
        <div className="mt-0.5 text-[var(--text-muted)]">
          {riskLabel(report.risk_level, t)}
        </div>
      </div>
    </button>
  );
}

const TimelineNode = React.memo(TimelineNodeInner);
export default TimelineNode;

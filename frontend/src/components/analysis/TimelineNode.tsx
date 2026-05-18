"use client";

import { sentimentColor } from "@/lib/analysis-helpers";
import { useT } from "@/components/LanguageProvider";
import type { AnalysisReport } from "@/lib/api";

interface TimelineNodeProps {
  report: AnalysisReport;
  isSelected: boolean;
  selectionOrder: number;
  onClick: () => void;
}

function trendIcon(trend: string): string {
  if (trend === "bullish") return "↑";
  if (trend === "bearish") return "↓";
  return "—";
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TimelineNode({
  report,
  isSelected,
  selectionOrder,
  onClick,
}: TimelineNodeProps) {
  const t = useT();
  const color = sentimentColor(report.sentiment_score);
  const scoreSign = report.sentiment_score > 0 ? "+" : "";

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center gap-0.5 outline-none"
      title={`${formatTime(report.created_at)} — ${report.sentiment_score} ${report.trend}`}
    >
      {/* Sentiment value */}
      <span
        className="text-[10px] font-semibold tabular-nums leading-none"
        style={{ color }}
      >
        {scoreSign}{report.sentiment_score}
      </span>

      {/* Trend icon */}
      <span className="text-[10px] leading-none text-[var(--text-muted)]">
        {trendIcon(report.trend)}
      </span>

      {/* Circle */}
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

      {/* Time */}
      <span className="text-[9px] leading-none text-[var(--text-muted)]">
        {formatTime(report.created_at)}
      </span>

      {/* Hover tooltip with risk */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] px-2.5 py-1.5 text-[10px] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
        <div className="font-medium text-[var(--text-primary)]">
          {new Date(report.created_at).toLocaleDateString()} {formatTime(report.created_at)}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span style={{ color }} className="font-semibold">
            {scoreSign}{report.sentiment_score}
          </span>
          <span className="text-[var(--text-muted)]">{report.trend}</span>
        </div>
        <div className="mt-0.5 text-[var(--text-muted)]">
          {t("analysis.risk" + report.risk_level.charAt(0).toUpperCase() + report.risk_level.slice(1))}
        </div>
      </div>
    </button>
  );
}

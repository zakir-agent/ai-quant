"use client";

import { useState } from "react";
import type { AnalysisReport } from "@/lib/api";
import { sentimentColor, trendLabel } from "@/lib/analysis-helpers";
import { useT } from "@/components/LanguageProvider";

interface TimelineNodeProps {
  report: AnalysisReport;
  isSelected: boolean;
  selectionOrder: number | null;
  showLabel?: boolean;
  onClick: () => void;
}

export default function TimelineNode({
  report,
  isSelected,
  selectionOrder,
  showLabel = true,
  onClick,
}: TimelineNodeProps) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const color = sentimentColor(report.sentiment_score);

  const dateStr = new Date(report.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const timeStr = new Date(report.created_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="relative flex flex-col items-center" style={{ flexShrink: 0 }}>
      {hovered && (
        <div className="absolute bottom-full z-20 mb-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] px-3 py-2 text-xs whitespace-nowrap shadow-xl">
          <div className="text-[var(--text-secondary)]">
            {dateStr} {timeStr}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono font-semibold" style={{ color }}>
              {report.sentiment_score}
            </span>
            <span className="text-[var(--text-muted)]">{trendLabel(report.trend, t)}</span>
          </div>
        </div>
      )}

      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative flex items-center justify-center"
        style={{ width: 20, height: 20 }}
      >
        {isSelected && (
          <div
            className="absolute animate-pulse rounded-full"
            style={{
              width: 28,
              height: 28,
              background: `color-mix(in srgb, ${color} 30%, transparent)`,
            }}
          />
        )}
        <div
          className="rounded-full transition-transform duration-150"
          style={{
            width: isSelected ? 16 : 12,
            height: isSelected ? 16 : 12,
            backgroundColor: color,
            transform: hovered ? "scale(1.3)" : "scale(1)",
          }}
        />
        {selectionOrder !== null && (
          <span className="absolute -top-2 -right-2 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[10px] font-bold text-black">
            {"①②"[selectionOrder - 1]}
          </span>
        )}
      </button>

      {showLabel && (
        <span className="mt-1 text-[10px] whitespace-nowrap text-[var(--text-muted)]">
          {dateStr}
        </span>
      )}
    </div>
  );
}

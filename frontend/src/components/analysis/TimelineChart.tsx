"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import { formatTimeSpan } from "@/lib/analysis-helpers";
import TimelineNode from "./TimelineNode";

interface TimelineChartProps {
  reports: AnalysisReport[];
  selectedIds: number[];
  onSelectIds: (ids: number[]) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export default function TimelineChart({
  reports,
  selectedIds,
  onSelectIds,
  hasMore,
  loadingMore,
  onLoadMore,
}: TimelineChartProps) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Reports are ordered newest-first (index 0 = newest).
  // Timeline displays left=oldest, right=newest, so reverse for rendering.
  const reversed = [...reports].reverse();

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateFades();
  }, [reports, updateFades]);

  const handleScroll = useCallback(() => {
    updateFades();
    const el = scrollRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollLeft < 40) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore, updateFades]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && reports.length > 0) {
      el.scrollLeft = el.scrollWidth;
    }
  }, []);

  const handleNodeClick = useCallback(
    (reportId: number) => {
      if (selectedIds.includes(reportId)) {
        if (selectedIds.length === 1) return;
        onSelectIds(selectedIds.filter((id) => id !== reportId));
      } else {
        if (selectedIds.length >= 2) {
          onSelectIds([selectedIds[0], reportId]);
        } else {
          onSelectIds([...selectedIds, reportId]);
        }
      }
    },
    [selectedIds, onSelectIds],
  );

  const selected0Idx = selectedIds[0] ? reversed.findIndex((r) => r.id === selectedIds[0]) : -1;
  const selected1Idx = selectedIds[1] ? reversed.findIndex((r) => r.id === selectedIds[1]) : -1;
  const hasTwoSelected = selectedIds.length === 2 && selected0Idx >= 0 && selected1Idx >= 0;

  const visibleLabels = reversed.map((_, i) => {
    if (i === 0 || i === reversed.length - 1) return true;
    return i % 3 === 0;
  });

  const timeSpanLabel = (() => {
    if (!hasTwoSelected) return null;
    const r0 = reports.find((r) => r.id === selectedIds[0]);
    const r1 = reports.find((r) => r.id === selectedIds[1]);
    if (!r0 || !r1) return null;
    return formatTimeSpan(r0.created_at, r1.created_at, t);
  })();

  return (
    <div className="relative rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] px-4 py-3 shadow-[var(--card-shadow)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">
          {selectedIds.length === 1 ? t("analysis.selectAnother") : timeSpanLabel}
        </span>
        {loadingMore && (
          <span className="animate-pulse text-xs text-[var(--text-muted)]">
            {t("analysis.loadingMore")}
          </span>
        )}
      </div>

      <div className="relative">
        {showLeftFade && (
          <div className="pointer-events-none absolute top-0 left-0 z-10 h-full w-8 bg-gradient-to-r from-[var(--bg-card)] to-transparent" />
        )}
        {showRightFade && (
          <div className="pointer-events-none absolute top-0 right-0 z-10 h-full w-8 bg-gradient-to-l from-[var(--bg-card)] to-transparent" />
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="scrollbar-none flex items-end gap-3 px-1 pt-14 pb-1"
          style={{ overflowX: "clip", overflowY: "visible", scrollbarWidth: "none" }}
        >
          {reversed.map((report, i) => {
            const isSelected = selectedIds.includes(report.id);
            const order = isSelected ? selectedIds.indexOf(report.id) + 1 : null;
            return (
              <TimelineNode
                key={report.id}
                report={report}
                isSelected={isSelected}
                selectionOrder={order}
                showLabel={visibleLabels[i]}
                onClick={() => handleNodeClick(report.id)}
              />
            );
          })}
        </div>

        {hasTwoSelected && (
          <div
            className="absolute border-t-2 border-dashed border-[var(--accent-primary)]/40"
            style={{
              top: 42,
              left: `calc(${Math.min(selected0Idx, selected1Idx) * (100 / reversed.length)}% + 16px)`,
              right: `calc(${(reversed.length - 1 - Math.max(selected0Idx, selected1Idx)) * (100 / reversed.length)}% + 16px)`,
            }}
          />
        )}
      </div>

      {hasTwoSelected && (
        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="inline-block h-px flex-1 bg-[var(--border-primary)]" />
          <span className="shrink-0">
            {t("analysis.reportA")} ↔ {t("analysis.reportB")}: {timeSpanLabel}
          </span>
          <span className="inline-block h-px flex-1 bg-[var(--border-primary)]" />
        </div>
      )}
    </div>
  );
}

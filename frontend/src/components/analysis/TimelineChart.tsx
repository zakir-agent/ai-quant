"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import TimelineNode from "./TimelineNode";

interface TimelineChartProps {
  reports: AnalysisReport[];
  selectedIds: number[]; // report IDs, length 1 or 2
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

  // Scroll to right (newest) on initial load
  useEffect(() => {
    const el = scrollRef.current;
    if (el && reports.length > 0) {
      el.scrollLeft = el.scrollWidth;
    }
  }, []); // only on mount

  const handleNodeClick = useCallback(
    (reportId: number) => {
      if (selectedIds.includes(reportId)) {
        // Deselect — but keep at least 1
        if (selectedIds.length === 1) return;
        onSelectIds(selectedIds.filter((id) => id !== reportId));
      } else {
        // Select — max 2
        if (selectedIds.length >= 2) {
          // Replace the second selection
          onSelectIds([selectedIds[0], reportId]);
        } else {
          onSelectIds([...selectedIds, reportId]);
        }
      }
    },
    [selectedIds, onSelectIds],
  );

  // Compute connecting line between two selected nodes
  const selected0Idx = selectedIds[0] ? reversed.findIndex((r) => r.id === selectedIds[0]) : -1;
  const selected1Idx = selectedIds[1] ? reversed.findIndex((r) => r.id === selectedIds[1]) : -1;
  const hasTwoSelected = selectedIds.length === 2 && selected0Idx >= 0 && selected1Idx >= 0;

  // Time span between two selected reports
  const timeSpanLabel = (() => {
    if (!hasTwoSelected) return null;
    const r0 = reports.find((r) => r.id === selectedIds[0]);
    const r1 = reports.find((r) => r.id === selectedIds[1]);
    if (!r0 || !r1) return null;
    const diffMs = Math.abs(new Date(r0.created_at).getTime() - new Date(r1.created_at).getTime());
    const totalMin = Math.round(diffMs / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) {
      return t("analysis.intervalDays").replace("{n}", String(days));
    }
    return t("analysis.intervalHours").replace("{n}", String(hours)).replace("{n2}", String(mins));
  })();

  return (
    <div className="relative rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] px-4 py-3 shadow-[var(--card-shadow)]">
      {/* Hint text */}
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

      {/* Scrollable timeline */}
      <div className="relative">
        {/* Left fade */}
        {showLeftFade && (
          <div className="pointer-events-none absolute top-0 left-0 z-10 h-full w-8 bg-gradient-to-r from-[var(--bg-card)] to-transparent" />
        )}
        {/* Right fade */}
        {showRightFade && (
          <div className="pointer-events-none absolute top-0 right-0 z-10 h-full w-8 bg-gradient-to-l from-[var(--bg-card)] to-transparent" />
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="scrollbar-none flex items-end gap-3 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {reversed.map((report, i) => {
            const isSelected = selectedIds.includes(report.id);
            const order = isSelected ? selectedIds.indexOf(report.id) + 1 : null;
            return (
              <TimelineNode
                key={report.id}
                report={report}
                index={i}
                isSelected={isSelected}
                selectionOrder={order}
                onClick={() => handleNodeClick(report.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Connecting line between two selected nodes */}
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

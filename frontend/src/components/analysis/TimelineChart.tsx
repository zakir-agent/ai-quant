"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useT } from "@/components/LanguageProvider";
import type { DayGroup } from "@/hooks/useAnalysisTimeline";
import TimelineNode from "./TimelineNode";
import DayGroupNode from "./DayGroupNode";

interface TimelineChartProps {
  dayGroups: DayGroup[];
  selectedIds: number[];
  expandedDays: Set<string>;
  hasMore: boolean;
  loadingMore: boolean;
  onToggleNode: (id: number) => void;
  onToggleDay: (dateStr: string) => void;
  onLoadMore: () => void;
}

export default function TimelineChart({
  dayGroups,
  selectedIds,
  expandedDays,
  hasMore,
  loadingMore,
  onToggleNode,
  onToggleDay,
  onLoadMore,
}: TimelineChartProps) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [dayGroups]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollLeft < 40) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  const selectionMap = useMemo(() => {
    const m = new Map<number, number>();
    selectedIds.forEach((id, i) => m.set(id, i + 1));
    return m;
  }, [selectedIds]);

  const selectedReports = useMemo(() => {
    return selectedIds
      .map((id) => {
        for (const g of dayGroups) {
          const r = g.reports.find((x) => x.id === id);
          if (r) return r;
        }
        return null;
      })
      .filter(Boolean);
  }, [selectedIds, dayGroups]);

  const timeSpan = useMemo(() => {
    if (selectedReports.length < 2) return null;
    const [a, b] = selectedReports;
    if (!a || !b) return null;
    const diffMs = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  }, [selectedReports]);

  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase text-[var(--text-muted)]">
          {t("analysis.timeline")}
        </h3>
        <div className="flex items-center gap-3">
          {selectedIds.length === 1 && (
            <span className="text-xs text-[var(--text-muted)]">
              {t("analysis.selectAnother")}
            </span>
          )}
          {selectedIds.length === 2 && timeSpan && (
            <span className="text-xs text-[var(--text-muted)]">
              {t("analysis.timeSpan")}: {timeSpan}
            </span>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Left fade */}
        {hasMore && (
          <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-8 bg-gradient-to-r from-[var(--bg-card)] to-transparent" />
        )}

        {/* Right fade */}
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-8 bg-gradient-to-l from-[var(--bg-card)] to-transparent" />

        {/* Scrollable container */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex items-end gap-1 overflow-x-auto px-2 py-2"
          style={{ scrollbarWidth: "none" }}
        >
          {dayGroups.map((group) => {
            const isExpanded = expandedDays.has(group.date);

            if (!isExpanded) {
              return (
                <DayGroupNode
                  key={group.date}
                  group={group}
                  isExpanded={false}
                  onClick={() => onToggleDay(group.date)}
                />
              );
            }

            return (
              <div key={group.date} className="flex items-end gap-1">
                {group.reports.map((report) => (
                  <TimelineNode
                    key={report.id}
                    report={report}
                    isSelected={selectedIds.includes(report.id)}
                    selectionOrder={selectionMap.get(report.id) ?? 0}
                    onClick={() => onToggleNode(report.id)}
                  />
                ))}
                <button
                  onClick={() => onToggleDay(group.date)}
                  className="ml-1 self-center text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  title={t("analysis.collapseDay")}
                >
                  ×
                </button>
              </div>
            );
          })}

          {loadingMore && (
            <div className="flex items-center px-3 text-xs text-[var(--text-muted)]">
              {t("analysis.loadingMore")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

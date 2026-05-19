"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/components/LanguageProvider";
import { formatTimeSpan } from "@/lib/analysis-helpers";
import type { AnalysisReport } from "@/lib/api";
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
  const prevCountRef = useRef(0);
  const prevScrollWidthRef = useRef(0);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  // Preserve scroll position when new items are prepended (load more),
  // scroll to end on initial load / scope change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const totalCount = dayGroups.reduce((sum, g) => sum + g.reports.length, 0);
    const prevCount = prevCountRef.current;
    const prevScrollWidth = prevScrollWidthRef.current;
    prevCountRef.current = totalCount;
    prevScrollWidthRef.current = el.scrollWidth;

    if (prevCount > 0 && totalCount > prevCount) {
      const deltaW = el.scrollWidth - prevScrollWidth;
      el.scrollLeft += deltaW;
    } else {
      el.scrollLeft = el.scrollWidth;
    }

    updateScrollState();
  }, [dayGroups, updateScrollState]);

  const handleScroll = useCallback(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollLeft < 40) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore, updateScrollState]);

  const scrollToRight = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, []);

  const reportById = useMemo(() => {
    const m = new Map<number, AnalysisReport>();
    for (const g of dayGroups) {
      for (const r of g.reports) m.set(r.id, r);
    }
    return m;
  }, [dayGroups]);

  const selectionMap = useMemo(() => {
    const m = new Map<number, string>();
    selectedIds.forEach((id, i) => m.set(id, String.fromCharCode(65 + i)));
    return m;
  }, [selectedIds]);

  const selectedReports = useMemo(
    () => selectedIds.map((id) => reportById.get(id) ?? null).filter(Boolean),
    [selectedIds, reportById],
  );

  const timeSpan = useMemo(() => {
    if (selectedReports.length < 2) return null;
    const [a, b] = selectedReports;
    if (!a || !b) return null;
    return formatTimeSpan(a.created_at, b.created_at, t);
  }, [selectedReports, t]);

  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase">
          {t("analysis.timeline")}
        </h3>
        <div className="flex items-center gap-3">
          {selectedIds.length === 1 && (
            <span className="text-xs text-[var(--text-muted)]">{t("analysis.selectAnother")}</span>
          )}
          {selectedIds.length === 2 && timeSpan && (
            <span className="text-xs text-[var(--text-muted)]">
              {t("analysis.timeSpan")}: {timeSpan}
            </span>
          )}
        </div>
      </div>

      <div className="relative flex items-center">
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            title={t("analysis.loadOlder")}
            className="z-20 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-muted)] shadow-md transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-secondary)] disabled:opacity-50"
          >
            {loadingMore ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            )}
          </button>
        )}

        <div className="relative flex-1 overflow-hidden">
          {hasMore && (
            <div className="pointer-events-none absolute top-0 left-0 z-10 h-full w-8 bg-gradient-to-r from-[var(--bg-card)] to-transparent" />
          )}

          <div className="pointer-events-none absolute top-0 right-0 z-10 h-full w-8 bg-gradient-to-l from-[var(--bg-card)] to-transparent" />

          {canScrollRight && (
            <button
              onClick={scrollToRight}
              title={t("analysis.scrollToLatest")}
              className="absolute top-1/2 right-1 z-20 flex h-7 w-7 shrink-0 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-muted)] shadow-md transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-secondary)]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}

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
                  <div key={group.date} className="shrink-0">
                    <DayGroupNode
                      group={group}
                      isExpanded={false}
                      onClick={() => onToggleDay(group.date)}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={group.date}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) onToggleDay(group.date);
                  }}
                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-dashed border-[var(--accent-primary)] px-2 transition-colors hover:border-[var(--accent-secondary)]"
                  style={{ height: 80, boxSizing: "border-box" }}
                  title={t("analysis.collapseDay")}
                >
                  {group.reports.map((report) => (
                    <TimelineNode
                      key={report.id}
                      report={report}
                      isSelected={selectionMap.has(report.id)}
                      selectionOrder={selectionMap.get(report.id) ?? ""}
                      onClick={() => onToggleNode(report.id)}
                    />
                  ))}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleDay(group.date);
                    }}
                    className="ml-1 cursor-pointer self-center text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  >
                    ×
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

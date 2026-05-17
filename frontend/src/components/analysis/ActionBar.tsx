"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/components/LanguageProvider";
import type { AnalysisReport } from "@/lib/api";
import { sentimentColor } from "@/lib/analysis-helpers";

interface ActionBarProps {
  running: boolean;
  reports: AnalysisReport[];
  selectedIdx: number;
  onSelectIdx: (idx: number) => void;
  analysisIntervalHours: number;
  onRun: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

function formatRelative(isoStr: string, now: number): string {
  const diff = now - new Date(isoStr).getTime();
  const hours = Math.floor(diff / 3600000);
  return hours < 1 ? "<1h" : `${hours}h`;
}

export default function ActionBar({
  running,
  reports,
  selectedIdx,
  onSelectIdx,
  analysisIntervalHours,
  onRun,
  hasMore,
  loadingMore,
  onLoadMore,
}: ActionBarProps) {
  const t = useT();
  const [now, setNow] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const immediate = setTimeout(() => setNow(Date.now()), 1);
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, []);

  const report = reports[selectedIdx];
  const hasPrev = selectedIdx < reports.length - 1;
  const hasNext = selectedIdx > 0;

  const relativeTime =
    report && now > 0
      ? t("common.hoursAgo").replace("{n}", formatRelative(report.created_at, now))
      : "";
  const overdue =
    report && now > 0
      ? now - new Date(report.created_at).getTime() > analysisIntervalHours * 3600000
      : false;

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setDropdownOpen(false);
    }
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen, handleClickOutside]);

  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => hasPrev && onSelectIdx(selectedIdx + 1)}
          disabled={!hasPrev}
          className="rounded-md px-2 py-1 text-sm transition-colors hover:bg-[var(--bg-card-hover)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          ◀
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)]"
          >
            {report ? (
              <>
                <span>{relativeTime}</span>
                <span className="text-[var(--text-muted)]">
                  ({new Date(report.created_at).toLocaleDateString()}{" "}
                  {new Date(report.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  )
                </span>
                <span className="text-[var(--text-muted)]">▼</span>
              </>
            ) : (
              <span>{t("analysis.noHistory")}</span>
            )}
          </button>

          {dropdownOpen && reports.length > 0 && (
            <div
              ref={listRef}
              onScroll={handleListScroll}
              className="absolute top-full left-0 z-30 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-xl"
            >
              {reports.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => {
                    onSelectIdx(i);
                    setDropdownOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-card-hover)] ${
                    i === selectedIdx ? "bg-[var(--bg-card-hover)]" : ""
                  }`}
                >
                  <span className="w-24 shrink-0 text-[var(--text-muted)]">
                    {new Date(r.created_at).toLocaleDateString()}{" "}
                    {new Date(r.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span
                    className="w-8 shrink-0 text-right font-mono font-semibold"
                    style={{ color: sentimentColor(r.sentiment_score) }}
                  >
                    {r.sentiment_score}
                  </span>
                  <span className="truncate text-[var(--text-secondary)]">{r.trend}</span>
                </button>
              ))}
              {loadingMore && (
                <div className="px-3 py-2 text-center text-xs text-[var(--text-muted)]">
                  {t("analysis.loadingMore") ?? "Loading..."}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => hasNext && onSelectIdx(selectedIdx - 1)}
          disabled={!hasNext}
          className="rounded-md px-2 py-1 text-sm transition-colors hover:bg-[var(--bg-card-hover)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          ▶
        </button>

        {report && (
          <span className="text-xs text-[var(--text-muted)]">
            {t("analysis.nextSuggested")}: ~{analysisIntervalHours}h
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onRun}
          disabled={running}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            running
              ? "cursor-not-allowed bg-[var(--bg-card-hover)] text-[var(--text-muted)]"
              : overdue
                ? "animate-pulse bg-[var(--accent-primary)] text-black hover:opacity-90"
                : "bg-[var(--bg-card-hover)] text-[var(--text-primary)] hover:bg-[var(--border-hover)]"
          }`}
        >
          {running ? t("analysis.analyzing") : t("analysis.runNew")}
        </button>
      </div>
    </div>
  );
}

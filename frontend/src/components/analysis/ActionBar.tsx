"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
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
}

function subscribeToMinute(callback: () => void) {
  const id = setInterval(callback, 60000);
  return () => clearInterval(id);
}

function getSnapshot(): number {
  return Date.now();
}

function getServerSnapshot(): number {
  return 0;
}

export default function ActionBar({
  running,
  reports,
  selectedIdx,
  onSelectIdx,
  analysisIntervalHours,
  onRun,
}: ActionBarProps) {
  const t = useT();
  const now = useSyncExternalStore(subscribeToMinute, getSnapshot, getServerSnapshot);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const report = reports[selectedIdx];
  const hasPrev = selectedIdx < reports.length - 1;
  const hasNext = selectedIdx > 0;

  let relativeTime = "";
  let overdue = false;

  if (report) {
    const diff = now - new Date(report.created_at).getTime();
    const hours = Math.floor(diff / 3600000);
    relativeTime = hours < 1 ? "<1h" : `${hours}h`;
    overdue = diff > analysisIntervalHours * 3600000;
  }

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

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2">
        {/* Prev button */}
        <button
          onClick={() => hasPrev && onSelectIdx(selectedIdx + 1)}
          disabled={!hasPrev}
          className="rounded-md px-2 py-1 text-sm transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ◀
        </button>

        {/* Time dropdown trigger */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-white/10"
          >
            {report ? (
              <>
                <span>{relativeTime}前</span>
                <span className="text-neutral-500">
                  ({new Date(report.created_at).toLocaleDateString()}{" "}
                  {new Date(report.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  )
                </span>
                <span className="text-neutral-600">▼</span>
              </>
            ) : (
              <span>{t("analysis.noHistory")}</span>
            )}
          </button>

          {/* Dropdown */}
          {dropdownOpen && reports.length > 0 && (
            <div className="absolute top-full left-0 z-30 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-white/10 bg-[var(--bg-secondary)] shadow-xl">
              {reports.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => {
                    onSelectIdx(i);
                    setDropdownOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5 ${
                    i === selectedIdx ? "bg-white/8" : ""
                  }`}
                >
                  <span className="w-24 shrink-0 text-neutral-500">
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
                  <span className="truncate text-neutral-400">{r.trend}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Next button */}
        <button
          onClick={() => hasNext && onSelectIdx(selectedIdx - 1)}
          disabled={!hasNext}
          className="rounded-md px-2 py-1 text-sm transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ▶
        </button>

        {report && (
          <span className="text-xs text-neutral-600">
            {t("analysis.nextSuggested")}: ~{analysisIntervalHours}h
          </span>
        )}
      </div>

      <button
        onClick={onRun}
        disabled={running}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          running
            ? "cursor-not-allowed bg-white/5 text-neutral-500"
            : overdue
              ? "animate-pulse bg-[var(--accent-primary)] text-black hover:opacity-90"
              : "bg-white/10 text-white hover:bg-white/15"
        }`}
      >
        {running ? t("analysis.analyzing") : t("analysis.runNew")}
      </button>
    </div>
  );
}

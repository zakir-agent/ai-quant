"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/components/LanguageProvider";

interface ActionBarProps {
  running: boolean;
  lastAnalysisAt: string | null;
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
  lastAnalysisAt,
  analysisIntervalHours,
  onRun,
}: ActionBarProps) {
  const t = useT();
  const now = useSyncExternalStore(subscribeToMinute, getSnapshot, getServerSnapshot);

  let relativeTime = "";
  let overdue = false;

  if (lastAnalysisAt) {
    const diff = now - new Date(lastAnalysisAt).getTime();
    const hours = Math.floor(diff / 3600000);
    relativeTime = hours < 1 ? "<1h" : `${hours}h`;
    overdue = diff > analysisIntervalHours * 3600000;
  }

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-4 text-xs text-neutral-500">
        {lastAnalysisAt && (
          <span>
            {t("analysis.lastAnalysis")}: {relativeTime}
          </span>
        )}
        {lastAnalysisAt && (
          <span>
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

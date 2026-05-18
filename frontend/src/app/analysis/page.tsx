"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  getAnalysisHistory,
  getAnalysisSymbols,
  getAccuracyStats,
  getNewsForScope,
  runAnalysis,
  type AnalysisReport,
  type AccuracyStats,
  type NewsArticleBrief,
} from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import { normalizeToScope, scopeToSymbol } from "@/lib/analysis-helpers";
import ErrorBlock from "@/components/ui/ErrorBlock";
import ScopeTabs from "@/components/analysis/ScopeTabs";
import TimelineChart from "@/components/analysis/TimelineChart";
import SentimentCard from "@/components/analysis/SentimentCard";
import RiskCard from "@/components/analysis/RiskCard";
import AccuracyCard from "@/components/analysis/AccuracyCard";
import RecommendationCard from "@/components/analysis/RecommendationCard";
import TechnicalCard from "@/components/analysis/TechnicalCard";
import NewsInsightCard from "@/components/analysis/NewsInsightCard";
import ObservationsCard from "@/components/analysis/ObservationsCard";
import ComparisonPanel from "@/components/analysis/ComparisonPanel";

function AnalysisSkeleton() {
  return (
    <div className="mx-auto max-w-7xl pb-4">
      <div className="animate-pulse space-y-4">
        <div className="h-10 rounded bg-[var(--bg-card)]" />
        <div className="h-20 rounded bg-[var(--bg-card)]" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-24 rounded bg-[var(--bg-card)]" />
          <div className="h-24 rounded bg-[var(--bg-card)]" />
          <div className="h-24 rounded bg-[var(--bg-card)]" />
        </div>
      </div>
    </div>
  );
}

function AnalysisPageInner() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSymbol = searchParams.get("symbol");

  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [scope, setScope] = useState(urlSymbol ? normalizeToScope(urlSymbol) : "market");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accuracyStats, setAccuracyStats] = useState<AccuracyStats | null>(null);
  const [newsItems, setNewsItems] = useState<NewsArticleBrief[]>([]);

  // selectedIds stores report IDs (not indices), length 1 or 2
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Resolve selected reports
  const reportMap = new Map(reports.map((r) => [r.id, r]));
  const activeReport = selectedIds.length >= 1 ? (reportMap.get(selectedIds[0]) ?? null) : null;
  const secondReport = selectedIds.length >= 2 ? (reportMap.get(selectedIds[1]) ?? null) : null;

  // URL → scope
  useEffect(() => {
    if (urlSymbol) {
      const newScope = normalizeToScope(urlSymbol);
      setScope((prev) => (prev !== newScope ? newScope : prev));
    }
  }, [urlSymbol]);

  const handleScopeChange = useCallback(
    (newScope: string) => {
      setScope(newScope);
      if (newScope === "market") {
        router.replace(pathname);
      } else {
        router.replace(`${pathname}?symbol=${scopeToSymbol(newScope)}`);
      }
    },
    [router, pathname],
  );

  useEffect(() => {
    getAnalysisSymbols()
      .then((data) => setSymbols(data.symbols))
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [histRes, statsRes, newsRes] = await Promise.allSettled([
        getAnalysisHistory(scope, 30),
        getAccuracyStats(),
        getNewsForScope(scope, 5),
      ]);

      if (histRes.status === "fulfilled") {
        const newReports = histRes.value.reports;
        setReports(newReports);
        setHasMoreHistory(histRes.value.has_more);
        // Default select the latest report
        if (newReports.length > 0) {
          setSelectedIds([newReports[0].id]);
        }
      }
      if (statsRes.status === "fulfilled") {
        setAccuracyStats(statsRes.value);
      }
      if (newsRes.status === "fulfilled") {
        setNewsItems(newsRes.value.articles);
      }
    } catch {
      setError(t("analysis.failPrefix"));
    } finally {
      setLoading(false);
    }
  }, [scope, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      await runAnalysis(scope);
      await loadData();
    } catch (e: unknown) {
      toast.error(
        `${t("analysis.failPrefix")}: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setRunning(false);
    }
  }, [scope, loadData, t]);

  const loadMoreHistory = useCallback(async () => {
    if (loadingMore || !hasMoreHistory) return;
    setLoadingMore(true);
    try {
      const res = await getAnalysisHistory(scope, 20, reports.length);
      setReports((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...res.reports.filter((r) => !seen.has(r.id))];
      });
      setHasMoreHistory(res.has_more);
    } catch {
      // silently ignore
    } finally {
      setLoadingMore(false);
    }
  }, [scope, reports.length, loadingMore, hasMoreHistory]);

  if (loading && reports.length === 0) {
    return <AnalysisSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl pb-4">
        <ErrorBlock message={error} onRetry={loadData} />
      </div>
    );
  }

  if (!loading && reports.length === 0) {
    return (
      <div className="mx-auto max-w-7xl pb-4">
        <ScopeTabs symbols={symbols} activeScope={scope} onScopeChange={handleScopeChange} />
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
          <p className="text-[var(--text-muted)]">{t("analysis.noHistory")}</p>
          <button
            onClick={handleRun}
            disabled={running}
            className="rounded-md bg-[var(--accent-primary)] px-6 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
          >
            {running ? t("analysis.analyzing") : t("analysis.runFirst")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="mx-auto max-w-7xl space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Top toolbar */}
      <div className="flex items-center justify-between">
        <ScopeTabs symbols={symbols} activeScope={scope} onScopeChange={handleScopeChange} />
        <button
          onClick={handleRun}
          disabled={running}
          className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            running
              ? "cursor-not-allowed bg-[var(--bg-card-hover)] text-[var(--text-muted)]"
              : "animate-pulse bg-[var(--accent-primary)] text-black hover:opacity-90"
          }`}
        >
          {running ? t("analysis.analyzing") : t("analysis.runNew")}
        </button>
      </div>

      {/* Timeline */}
      <TimelineChart
        reports={reports}
        selectedIds={selectedIds}
        onSelectIds={setSelectedIds}
        hasMore={hasMoreHistory}
        loadingMore={loadingMore}
        onLoadMore={loadMoreHistory}
      />

      {/* Detail / Comparison area */}
      {selectedIds.length === 2 && activeReport && secondReport ? (
        <ComparisonPanel reportA={activeReport} reportB={secondReport} />
      ) : (
        activeReport && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SentimentCard report={activeReport} />
            <RiskCard report={activeReport} />
            <AccuracyCard stats={accuracyStats} />
            <RecommendationCard report={activeReport} />
            <TechnicalCard report={activeReport} />
            <NewsInsightCard news={newsItems} />
            <ObservationsCard report={activeReport} />
          </div>
        )
      )}
    </motion.div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<AnalysisSkeleton />}>
      <AnalysisPageInner />
    </Suspense>
  );
}

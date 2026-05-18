"use client";

import { useCallback, useEffect, useState } from "react";
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
import ErrorBlock from "@/components/ui/ErrorBlock";
import ScopeTabs from "@/components/analysis/ScopeTabs";
import ActionBar from "@/components/analysis/ActionBar";
import SentimentCard from "@/components/analysis/SentimentCard";
import RiskCard from "@/components/analysis/RiskCard";
import AccuracyCard from "@/components/analysis/AccuracyCard";
import RecommendationCard from "@/components/analysis/RecommendationCard";
import TechnicalCard from "@/components/analysis/TechnicalCard";
import NewsInsightCard from "@/components/analysis/NewsInsightCard";
import CompareCard from "@/components/analysis/CompareCard";
import ReportDrawer from "@/components/analysis/ReportDrawer";

const ANALYSIS_INTERVAL_HOURS = 4;

export default function AnalysisPage() {
  const t = useT();

  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [scope, setScope] = useState("market");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accuracyStats, setAccuracyStats] = useState<AccuracyStats | null>(null);
  const [newsItems, setNewsItems] = useState<NewsArticleBrief[]>([]);

  const [selectedIdx, setSelectedIdx] = useState(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerReport, setDrawerReport] = useState<AnalysisReport | null>(null);

  const activeReport = reports.length > 0 ? reports[selectedIdx] : null;

  const openDrawer = useCallback(
    (report?: AnalysisReport) => {
      setDrawerReport(report || activeReport || null);
      setDrawerOpen(true);
    },
    [activeReport],
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

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
        getAnalysisHistory(scope, 20),
        getAccuracyStats(),
        getNewsForScope(scope, 5),
      ]);

      if (histRes.status === "fulfilled") {
        setReports(histRes.value.reports);
        setHasMoreHistory(histRes.value.has_more);
        setSelectedIdx(0);
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

  // Loading state
  if (loading && reports.length === 0) {
    return (
      <div className="mx-auto max-w-7xl pb-4">
        <div className="animate-pulse space-y-4">
          <div className="h-10 rounded bg-[var(--bg-card)]" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-24 rounded bg-[var(--bg-card)]" />
            <div className="h-24 rounded bg-[var(--bg-card)]" />
            <div className="h-24 rounded bg-[var(--bg-card)]" />
          </div>
          <div className="col-span-2 h-32 rounded bg-[var(--bg-card)]" />
          <div className="col-span-3 h-48 rounded bg-[var(--bg-card)]" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="mx-auto max-w-7xl pb-4">
        <ErrorBlock message={error} onRetry={loadData} />
      </div>
    );
  }

  // Empty state
  if (!loading && reports.length === 0) {
    return (
      <div className="mx-auto max-w-7xl pb-4">
        <ScopeTabs symbols={symbols} activeScope={scope} onScopeChange={setScope} />
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
      <div className="flex items-center justify-between">
        <ScopeTabs symbols={symbols} activeScope={scope} onScopeChange={setScope} />
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
      <ActionBar
        reports={reports}
        selectedIdx={selectedIdx}
        onSelectIdx={setSelectedIdx}
        analysisIntervalHours={ANALYSIS_INTERVAL_HOURS}
        hasMore={hasMoreHistory}
        loadingMore={loadingMore}
        onLoadMore={loadMoreHistory}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {activeReport && (
          <>
            <SentimentCard report={activeReport} onClick={() => openDrawer(activeReport)} />
            <RiskCard report={activeReport} onClick={() => openDrawer(activeReport)} />
            <AccuracyCard stats={accuracyStats} onClick={() => openDrawer()} />
            <RecommendationCard report={activeReport} onClick={() => openDrawer(activeReport)} />
            <TechnicalCard report={activeReport} onClick={() => openDrawer(activeReport)} />
            <NewsInsightCard news={newsItems} />
            <CompareCard reports={reports} onClick={() => openDrawer()} />
          </>
        )}
      </div>

      <ReportDrawer report={drawerReport} open={drawerOpen} onClose={closeDrawer}>
        {drawerReport && (
          <div className="space-y-6">
            {drawerReport.key_observations && drawerReport.key_observations.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
                  {t("analysis.keyObservations")}
                </h3>
                <ul className="space-y-1">
                  {drawerReport.key_observations.map((obs, i) => (
                    <li key={i} className="text-sm">
                      • {obs}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {drawerReport.risk_warnings && drawerReport.risk_warnings.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
                  {t("analysis.riskWarnings")}
                </h3>
                <ul className="space-y-1">
                  {drawerReport.risk_warnings.map((w, i) => (
                    <li key={i} className="text-sm text-red-400">
                      • {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {drawerReport.token_usage && (
              <div className="text-xs text-[var(--text-muted)]">
                {drawerReport.model_used} · {t("analysis.tokens")}:{" "}
                {drawerReport.token_usage.input + drawerReport.token_usage.output} ·{" "}
                {t("analysis.cost")}: ${drawerReport.token_usage.cost_usd.toFixed(4)}
              </div>
            )}
          </div>
        )}
      </ReportDrawer>
    </motion.div>
  );
}

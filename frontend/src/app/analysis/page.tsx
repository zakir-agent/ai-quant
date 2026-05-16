"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getAnalysisHistory,
  getAnalysisSymbols,
  getAccuracyStats,
  getNewsForScope,
  runAnalysis,
  type AnalysisReport,
  type AccuracyStats,
} from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import ErrorBlock from "@/components/ui/ErrorBlock";
import ScopeTabs from "@/components/analysis/ScopeTabs";
import ActionBar from "@/components/analysis/ActionBar";
import SentimentCard from "@/components/analysis/SentimentCard";
import RiskCard from "@/components/analysis/RiskCard";
import SummaryCard from "@/components/analysis/SummaryCard";
import AccuracyCard from "@/components/analysis/AccuracyCard";
import RecommendationCard from "@/components/analysis/RecommendationCard";
import TechnicalCard from "@/components/analysis/TechnicalCard";
import NewsInsightCard from "@/components/analysis/NewsInsightCard";
import CompareCard from "@/components/analysis/CompareCard";
import DataSourcesCard from "@/components/analysis/DataSourcesCard";
import ReportDrawer from "@/components/analysis/ReportDrawer";

const ANALYSIS_INTERVAL_HOURS = 4;

interface NewsItem {
  title: string;
  direction: number;
  event_type: string;
  intensity: number;
  primary_asset: string | null;
}

export default function AnalysisPage() {
  const t = useT();

  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [scope, setScope] = useState("market");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accuracyStats, setAccuracyStats] = useState<AccuracyStats | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerReport, setDrawerReport] = useState<AnalysisReport | null>(null);

  const latestReport = reports.length > 0 ? reports[0] : null;

  const openDrawer = useCallback(
    (report?: AnalysisReport) => {
      setDrawerReport(report || latestReport || null);
      setDrawerOpen(true);
    },
    [latestReport]
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
        getAccuracyStats(scope),
        getNewsForScope(scope, 5),
      ]);

      if (histRes.status === "fulfilled") {
        setReports(histRes.value.reports);
      }
      if (statsRes.status === "fulfilled") {
        setAccuracyStats(statsRes.value);
      }
      if (newsRes.status === "fulfilled") {
        setNewsItems(
          (newsRes.value.articles as Record<string, unknown>[]).map(
            (a: Record<string, unknown>) => ({
              title: (a as Record<string, unknown>).title as string,
              direction:
                ((a as Record<string, unknown>).analysis as Record<string, unknown>)
                  ?.direction as number ?? 0,
              event_type:
                ((a as Record<string, unknown>).analysis as Record<string, unknown>)
                  ?.event_type as string ?? "",
              intensity:
                ((a as Record<string, unknown>).analysis as Record<string, unknown>)
                  ?.intensity as number ?? 0,
              primary_asset:
                ((a as Record<string, unknown>).analysis as Record<string, unknown>)
                  ?.primary_asset as string ?? null,
            })
          )
        );
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
        `${t("analysis.failPrefix")}: ${e instanceof Error ? e.message : "Unknown error"}`
      );
    } finally {
      setRunning(false);
    }
  }, [scope, loadData, t]);

  // Loading state
  if (loading && reports.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 rounded bg-white/5" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-24 rounded bg-white/5" />
            <div className="h-24 rounded bg-white/5" />
            <div className="h-24 rounded bg-white/5" />
          </div>
          <div className="col-span-2 h-32 rounded bg-white/5" />
          <div className="col-span-3 h-48 rounded bg-white/5" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <ErrorBlock message={error} onRetry={loadData} />
      </div>
    );
  }

  // Empty state
  if (!loading && reports.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <ScopeTabs
          symbols={symbols}
          activeScope={scope}
          onScopeChange={setScope}
        />
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
          <p className="text-neutral-500">{t("analysis.noHistory")}</p>
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
    <div className="mx-auto max-w-7xl px-4 py-6">
      <ScopeTabs
        symbols={symbols}
        activeScope={scope}
        onScopeChange={setScope}
      />
      <ActionBar
        running={running}
        lastAnalysisAt={latestReport?.created_at ?? null}
        analysisIntervalHours={ANALYSIS_INTERVAL_HOURS}
        onRun={handleRun}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {latestReport && (
          <>
            <SentimentCard
              report={latestReport}
              onClick={() => openDrawer(latestReport)}
            />
            <RiskCard
              report={latestReport}
              onClick={() => openDrawer(latestReport)}
            />
            <SummaryCard
              report={latestReport}
              onClick={() => openDrawer(latestReport)}
            />
            <AccuracyCard
              stats={accuracyStats}
              onClick={() => openDrawer()}
            />
            <RecommendationCard
              report={latestReport}
              onClick={() => openDrawer(latestReport)}
            />
            <TechnicalCard
              report={latestReport}
              onClick={() => openDrawer(latestReport)}
            />
            <NewsInsightCard news={newsItems} onClick={() => openDrawer()} />
            <CompareCard reports={reports} onClick={() => openDrawer()} />
            <DataSourcesCard report={latestReport} />
          </>
        )}
      </div>

      <ReportDrawer
        report={drawerReport}
        open={drawerOpen}
        onClose={closeDrawer}
      >
        {drawerReport && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-400">
                {t("analysis.summary")}
              </h3>
              <p className="text-sm leading-relaxed">
                {drawerReport.summary}
              </p>
            </div>

            {drawerReport.key_observations &&
              drawerReport.key_observations.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-neutral-400">
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

            {drawerReport.risk_warnings &&
              drawerReport.risk_warnings.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-neutral-400">
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
              <div className="text-xs text-neutral-500">
                {drawerReport.model_used} · {t("analysis.tokens")}:{" "}
                {(drawerReport.token_usage as Record<string, unknown>).total_tokens as number || "—"}{" "}
                · {t("analysis.cost")}: $
                {(drawerReport.token_usage as Record<string, unknown>).cost as number || "0"}
              </div>
            )}
          </div>
        )}
      </ReportDrawer>
    </div>
  );
}

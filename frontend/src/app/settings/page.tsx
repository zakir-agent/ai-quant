"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  getConfig,
  getSystemStatus,
  getSchedulerStatus,
  getNewsStats,
  getNewsAnalysisStats,
  getAnalysisReportStats,
  type AppConfig,
  type SystemStatus,
  type SchedulerStatus,
} from "@/lib/api";
import ErrorBlock from "@/components/ui/ErrorBlock";
import AiModelCard from "@/components/settings/AiModelCard";
import DataSourcesCard from "@/components/settings/DataSourcesCard";
import CollectionScheduleCard from "@/components/settings/CollectionScheduleCard";
import SchedulerJobsCard from "@/components/settings/SchedulerJobsCard";
import { useLanguage } from "@/components/LanguageProvider";

// Lazy-loaded for stats tab
const AiUsageCard = dynamic(() => import("@/components/settings/AiUsageCard"));
const DataStatisticsCard = dynamic(() => import("@/components/settings/DataStatisticsCard"));
const DailyBarChart = dynamic(() => import("@/components/settings/DailyBarChart"));
const GroupedBarChart = dynamic(() => import("@/components/settings/GroupedBarChart"));
const DataIntegrityCard = dynamic(() => import("@/components/settings/DataIntegrityCard"));

// Lazy-loaded for alert tab
const AlertingCard = dynamic(() => import("@/components/settings/AlertingCard"));

const newsPipelineSeries = [
  {
    labelKey: "settings.newsCollectionStats",
    color: "var(--accent-primary)",
    totalLabelKey: "settings.newsCollectionTotal",
    fetchStats: getNewsStats,
  },
  {
    labelKey: "settings.newsAnalysisStats",
    color: "var(--success)",
    totalLabelKey: "settings.newsAnalysisTotal",
    fetchStats: getNewsAnalysisStats,
  },
] as const;

export default function SettingsPage() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"config" | "stats" | "alert">("config");

  const newsPipelineData = useMemo(
    () =>
      newsPipelineSeries.map((s) => ({
        label: t(s.labelKey),
        color: s.color,
        totalLabel: t(s.totalLabelKey),
        fetchStats: s.fetchStats,
      })),
    [t],
  );

  const loadSettings = () => {
    setError(null);
    Promise.all([getConfig(), getSystemStatus(), getSchedulerStatus()])
      .then(([c, s, sch]) => {
        setConfig(c);
        setStatus(s);
        setScheduler(sch);
      })
      .catch(() => setError("loadFailed"));
  };

  useEffect(() => {
    queueMicrotask(() => loadSettings());
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <ErrorBlock
          message={t("common.loadFailed")}
          onRetry={loadSettings}
          retryLabel={t("common.retry")}
        />
      </div>
    );
  }

  if (!config || !status) {
    return (
      <div className="mx-auto max-w-7xl">
        <p className="text-[var(--text-muted)]">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Tabs */}
      <div
        className="inline-flex items-center gap-1 rounded-lg p-1"
        style={{ background: "var(--bg-card)" }}
      >
        {(["config", "stats", "alert"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200"
            style={{
              background:
                activeTab === tab
                  ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)"
                  : "transparent",
              color: activeTab === tab ? "var(--accent-primary)" : "var(--text-muted)",
              boxShadow: activeTab === tab ? "0 0 12px var(--glow-color)" : "none",
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab) {
                e.currentTarget.style.background =
                  "color-mix(in srgb, var(--accent-primary) 6%, transparent)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }
            }}
          >
            {t(`settings.section.${tab}`)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-4 pt-2">
        {activeTab === "config" && (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <AiModelCard config={config} />
              <CollectionScheduleCard config={config} />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <DataSourcesCard config={config} status={status} />
              {scheduler && <SchedulerJobsCard scheduler={scheduler} />}
            </div>
          </>
        )}
        {activeTab === "stats" && (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <AiUsageCard status={status} className="h-full" />
              </div>
              <div className="sm:col-span-2">
                <DataStatisticsCard status={status} className="h-full" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <GroupedBarChart
                title={t("settings.newsPipelineStats")}
                series={newsPipelineData}
              />
              <DailyBarChart
                title={t("settings.analysisReportStats")}
                totalLabel={t("settings.analysisReportTotal")}
                fetchStats={getAnalysisReportStats}
              />
            </div>
            <DataIntegrityCard />
          </>
        )}
        {activeTab === "alert" && <AlertingCard config={config} />}
      </div>
    </div>
  );
}

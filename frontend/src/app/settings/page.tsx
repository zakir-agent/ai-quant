"use client";

import { useEffect, useState } from "react";
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
import AiUsageCard from "@/components/settings/AiUsageCard";
import DataSourcesCard from "@/components/settings/DataSourcesCard";
import CollectionScheduleCard from "@/components/settings/CollectionScheduleCard";
import AlertingCard from "@/components/settings/AlertingCard";
import DataStatisticsCard from "@/components/settings/DataStatisticsCard";
import DataIntegrityCard from "@/components/settings/DataIntegrityCard";
import DailyBarChart from "@/components/settings/DailyBarChart";
import SchedulerJobsCard from "@/components/settings/SchedulerJobsCard";
import { useLanguage } from "@/components/LanguageProvider";

export default function SettingsPage() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"config" | "stats" | "alert">("config");

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
            <div className="grid grid-cols-2 gap-6">
              <AiModelCard config={config} />
              <CollectionScheduleCard config={config} />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <DataSourcesCard config={config} status={status} />
              {scheduler && <SchedulerJobsCard scheduler={scheduler} />}
            </div>
          </>
        )}
        {activeTab === "stats" && (
          <>
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-1">
                <AiUsageCard status={status} />
              </div>
              <div className="col-span-2">
                <DataStatisticsCard status={status} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <DailyBarChart
                title={t("settings.newsCollectionStats")}
                totalLabel={t("settings.newsCollectionTotal")}
                fetchStats={getNewsStats}
              />
              <DailyBarChart
                title={t("settings.newsAnalysisStats")}
                totalLabel={t("settings.newsAnalysisTotal")}
                fetchStats={getNewsAnalysisStats}
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

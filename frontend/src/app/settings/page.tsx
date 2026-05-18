"use client";

import { useEffect, useState } from "react";
import {
  getConfig,
  getSystemStatus,
  getSchedulerStatus,
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
import SchedulerJobsCard from "@/components/settings/SchedulerJobsCard";
import { useLanguage } from "@/components/LanguageProvider";

export default function SettingsPage() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ai" | "data" | "alert">("ai");

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
        {(["ai", "data", "alert"] as const).map((tab) => (
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
        {activeTab === "ai" && (
          <>
            <div className="grid grid-cols-2 gap-6">
              <AiModelCard config={config} />
              <AiUsageCard status={status} />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <CollectionScheduleCard config={config} />
              {scheduler && <SchedulerJobsCard scheduler={scheduler} />}
            </div>
          </>
        )}
        {activeTab === "data" && (
          <>
            <div className="grid grid-cols-2 gap-6">
              <DataSourcesCard config={config} status={status} />
              <DataStatisticsCard status={status} />
            </div>
            <DataIntegrityCard />
          </>
        )}
        {activeTab === "alert" && <AlertingCard config={config} />}
      </div>
    </div>
  );
}

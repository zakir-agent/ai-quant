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
import { SectionHeader } from "@/components/settings/shared";
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
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("settings.title")}</h2>
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
        <h2 className="mb-6 text-2xl font-bold text-[var(--text-primary)]">
          {t("settings.title")}
        </h2>
        <p className="text-[var(--text-muted)]">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-2">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("settings.title")}</h2>

      {/* AI & Analysis */}
      <SectionHeader title={t("settings.section.ai")} />
      <div className="grid grid-cols-2 gap-6">
        <AiModelCard config={config} />
        <AiUsageCard status={status} />
      </div>
      <AlertingCard config={config} />
      <div className="grid grid-cols-2 gap-6">
        <CollectionScheduleCard config={config} />
        {scheduler && <SchedulerJobsCard scheduler={scheduler} />}
      </div>

      {/* Data & Sources */}
      <SectionHeader title={t("settings.section.data")} />
      <div className="grid grid-cols-2 gap-6">
        <DataSourcesCard config={config} status={status} />
        <DataStatisticsCard status={status} />
      </div>
      <DataIntegrityCard />
    </div>
  );
}

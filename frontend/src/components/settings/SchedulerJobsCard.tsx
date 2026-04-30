"use client";

import Card from "@/components/ui/Card";
import { StatusDot } from "./shared";
import { useLanguage } from "@/components/LanguageProvider";
import type { SchedulerStatus } from "@/lib/api";

export default function SchedulerJobsCard({ scheduler }: { scheduler: SchedulerStatus }) {
  const { t, locale } = useLanguage();
  const dateLocale = locale === "zh" ? "zh-CN" : "en-US";

  return (
    <Card title={t("settings.schedulerJobs")}>
      <div className="space-y-2 text-sm">
        <div
          className="flex items-center gap-2 pb-1"
          style={{ borderBottom: "1px solid var(--border-primary)" }}
        >
          <StatusDot ok={scheduler.running} />
          <span className="text-xs text-[var(--text-muted)]">
            {scheduler.running ? t("settings.schedulerRunning") : t("settings.schedulerStopped")}
          </span>
        </div>
        {scheduler.jobs?.map((job) => (
          <div key={job.id} className="flex justify-between">
            <span className="text-[var(--text-muted)]">{job.name}</span>
            <span className="text-xs text-[var(--text-muted)]">
              {t("settings.nextRun")}:{" "}
              {job.next_run ? new Date(job.next_run).toLocaleString(dateLocale) : "-"}
            </span>
          </div>
        ))}
        {(!scheduler.jobs || scheduler.jobs.length === 0) && (
          <p className="text-[var(--text-muted)]">{t("settings.noJobs")}</p>
        )}
      </div>
    </Card>
  );
}

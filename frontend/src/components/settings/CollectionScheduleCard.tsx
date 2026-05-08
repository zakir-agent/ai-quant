"use client";

import Card from "@/components/ui/Card";
import { useLanguage } from "@/components/LanguageProvider";
import type { AppConfig } from "@/lib/api";

export default function CollectionScheduleCard({ config }: { config: AppConfig }) {
  const { t } = useLanguage();
  return (
    <Card title={t("settings.schedule")}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.marketInterval")}</span>
          <span className="text-[var(--text-primary)]">
            {config.schedule.collect_interval_minutes} {t("common.minutes")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.newsInterval")}</span>
          <span className="text-[var(--text-primary)]">
            {config.schedule.news_collect_interval_minutes} {t("common.minutes")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.analysisInterval")}</span>
          <span className="text-[var(--text-primary)]">
            {config.schedule.analysis_interval_hours} {t("common.hours")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.newsAnalysisInterval")}</span>
          <span className="text-[var(--text-primary)]">
            {config.schedule.news_analysis_interval_minutes} {t("common.minutes")}
          </span>
        </div>
      </div>
    </Card>
  );
}

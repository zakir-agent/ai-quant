"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { getAnalysisReportStats } from "@/lib/api";
import DailyBarChart from "./DailyBarChart";

export default function AnalysisReportStatsCard() {
  const { t } = useLanguage();
  return (
    <DailyBarChart
      title={t("settings.analysisReportStats")}
      totalLabel={t("settings.analysisReportTotal")}
      fetchStats={getAnalysisReportStats}
    />
  );
}

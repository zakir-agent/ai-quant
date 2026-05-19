"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { getNewsAnalysisStats } from "@/lib/api";
import DailyBarChart from "./DailyBarChart";

export default function NewsAnalysisStatsCard() {
  const { t } = useLanguage();
  return (
    <DailyBarChart
      title={t("settings.newsAnalysisStats")}
      totalLabel={t("settings.newsAnalysisTotal")}
      fetchStats={getNewsAnalysisStats}
    />
  );
}

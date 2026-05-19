"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { getNewsStats } from "@/lib/api";
import DailyBarChart from "./DailyBarChart";

export default function NewsCollectionStatsCard() {
  const { t } = useLanguage();
  return (
    <DailyBarChart
      title={t("settings.newsCollectionStats")}
      totalLabel={t("settings.newsCollectionTotal")}
      fetchStats={getNewsStats}
    />
  );
}

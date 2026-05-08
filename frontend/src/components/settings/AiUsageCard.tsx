"use client";

import Card from "@/components/ui/Card";
import { useLanguage } from "@/components/LanguageProvider";
import type { SystemStatus } from "@/lib/api";

interface AiUsageCardProps {
  status: SystemStatus;
}

export default function AiUsageCard({ status }: AiUsageCardProps) {
  const { t } = useLanguage();
  const usage = status.ai_usage_today;
  const quota = usage.quota;
  const marketUsage = usage.market_analysis;
  const newsUsage = usage.news_analysis;
  const pct = quota.daily_limit ? Math.min(100, (quota.used_count / quota.daily_limit) * 100) : 0;
  const quotaReached = quota.daily_limit > 0 && quota.used_count >= quota.daily_limit;

  return (
    <Card title={t("settings.aiUsage")}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.quotaUsed")}</span>
          <span className="text-[var(--text-primary)]">
            {quota.used_count} / {quota.daily_limit}
          </span>
        </div>
        <div
          className="mt-2 h-2 w-full rounded-full"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${pct}%`,
              backgroundColor: "var(--accent-primary)",
            }}
          />
        </div>
        <p className="text-right text-[10px] text-[var(--text-muted)]">{pct.toFixed(0)}%</p>
        {quotaReached ? (
          <p className="text-xs text-[var(--accent-warning)]">{t("settings.quotaReachedHint")}</p>
        ) : null}
        <div className="pt-1 text-xs font-medium text-[var(--text-muted)]">
          {t("settings.marketAnalysis")}
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.analysisCount")}</span>
          <span className="text-[var(--text-primary)]">{marketUsage.analyses_count}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.totalCost")}</span>
          <span className="font-mono text-[var(--text-primary)]">${marketUsage.total_cost_usd ?? 0}</span>
        </div>

        <div className="border-t border-[var(--border-primary)] pt-2 text-xs font-medium text-[var(--text-muted)]">
          {t("settings.newsAnalysisData")}
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.analysisCount")}</span>
          <span className="text-[var(--text-primary)]">{newsUsage.analyses_count}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.totalCost")}</span>
          <span className="font-mono text-[var(--text-primary)]">
            {newsUsage.total_cost_usd == null ? t("settings.notAvailable") : `$${newsUsage.total_cost_usd}`}
          </span>
        </div>
      </div>
    </Card>
  );
}

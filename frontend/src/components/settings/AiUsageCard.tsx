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
  const pct = Math.min(100, (usage.analyses_count / usage.daily_limit) * 100);

  return (
    <Card title={t("settings.aiUsage")}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.analysisCount")}</span>
          <span className="text-[var(--text-primary)]">
            {usage.analyses_count} / {usage.daily_limit}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.totalCost")}</span>
          <span className="font-mono text-[var(--text-primary)]">${usage.total_cost_usd}</span>
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
      </div>
    </Card>
  );
}

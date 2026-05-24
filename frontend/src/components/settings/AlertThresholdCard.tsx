"use client";

import Card from "@/components/ui/Card";
import { useLanguage } from "@/components/LanguageProvider";
import type { AppConfig } from "@/lib/api";

export default function AlertThresholdCard({ config }: { config: AppConfig }) {
  const { t } = useLanguage();

  return (
    <Card title={t("settings.thresholds")}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.priceThreshold")}</span>
          <span className="font-mono text-[var(--text-primary)]">
            {config.alert.price_change_pct}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.sentimentThreshold")}</span>
          <span className="font-mono text-[var(--text-primary)]">
            {config.alert.sentiment_delta}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.cooldown")}</span>
          <span className="font-mono text-[var(--text-primary)]">
            {config.alert.cooldown_minutes} {t("common.minutes")}
          </span>
        </div>
      </div>
    </Card>
  );
}

"use client";

import Card from "@/components/ui/Card";
import { StatusDot } from "./shared";
import { useLanguage } from "@/components/LanguageProvider";
import type { AppConfig } from "@/lib/api";

export default function AiModelCard({ config }: { config: AppConfig }) {
  const { t } = useLanguage();
  return (
    <Card title={t("settings.aiConfig")}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.primaryModel")}</span>
          <span className="font-mono text-[var(--text-primary)]">{config.ai.primary_model}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.fallbackModel")}</span>
          <span className="font-mono text-[var(--text-primary)]">{config.ai.fallback_model}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.fastModel")}</span>
          <span className="font-mono text-[var(--text-primary)]">{config.ai.fast_model}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.dailyLimit")}</span>
          <span className="text-[var(--text-primary)]">
            {config.ai.max_analyses_per_day} {t("settings.timesPerDay")}
          </span>
        </div>
        <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border-primary)" }}>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">API Key</span>
            <StatusDot ok={config.ai.has_api_key} />
          </div>
        </div>
      </div>
    </Card>
  );
}

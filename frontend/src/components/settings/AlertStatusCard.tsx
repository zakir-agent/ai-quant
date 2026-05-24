"use client";

import Card from "@/components/ui/Card";
import { StatusDot } from "./shared";
import { useLanguage } from "@/components/LanguageProvider";
import type { AppConfig } from "@/lib/api";

export default function AlertStatusCard({ config }: { config: AppConfig }) {
  const { t } = useLanguage();

  return (
    <Card title={t("settings.alerting")}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.alertEnabled")}</span>
          <StatusDot ok={config.alert.enabled} />
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Telegram</span>
          <StatusDot ok={config.alert.telegram_configured} />
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.telegramToken")}</span>
          <StatusDot ok={config.alert.telegram_bot_token_set} />
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("settings.telegramChatId")}</span>
          <span className="font-mono text-[var(--text-primary)]">
            {config.alert.telegram_chat_id_masked || "-"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Webhook</span>
          <StatusDot ok={config.alert.webhook_configured} />
        </div>
      </div>
    </Card>
  );
}

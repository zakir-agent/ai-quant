"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import { StatusDot } from "./shared";
import { useLanguage } from "@/components/LanguageProvider";
import { sendAlertTest } from "@/lib/api";
import TelegramLogList from "./TelegramLogList";
import type { AppConfig } from "@/lib/api";

export default function AlertingCard({ config }: { config: AppConfig }) {
  const { t } = useLanguage();
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [tgLogOpen, setTgLogOpen] = useState(false);

  const handleSendTest = async () => {
    try {
      setTestSending(true);
      setTestResult(null);
      const result = await sendAlertTest();
      if (result.sent) {
        setTestResult("sent");
      } else if (result.reason === "not_configured" || result.reason === "disabled") {
        setTestResult("notConfigured");
      } else {
        setTestResult("failed");
      }
    } catch {
      setTestResult("failed");
    } finally {
      setTestSending(false);
    }
  };

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
        <div className="mt-2 space-y-1 border-t border-[var(--border-primary)] pt-2 text-xs">
          <div className="flex justify-between text-[var(--text-muted)]">
            <span>{t("settings.priceThreshold")}</span>
            <span>{config.alert.price_change_pct}%</span>
          </div>
          <div className="flex justify-between text-[var(--text-muted)]">
            <span>{t("settings.sentimentThreshold")}</span>
            <span>{config.alert.sentiment_delta}</span>
          </div>
          <div className="flex justify-between text-[var(--text-muted)]">
            <span>{t("settings.cooldown")}</span>
            <span>
              {config.alert.cooldown_minutes} {t("common.minutes")}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleSendTest()}
          disabled={testSending || !config.alert.enabled}
          className="mt-2 w-full rounded-md px-3 py-2 text-xs font-medium transition disabled:opacity-50"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "var(--text-primary)",
          }}
        >
          {testSending ? t("settings.testingAlert") : t("settings.testAlert")}
        </button>
        {testResult && (
          <p className="text-xs text-[var(--text-muted)]">
            {testResult === "sent"
              ? t("settings.testAlertSent")
              : testResult === "notConfigured"
                ? t("settings.testAlertNotConfigured")
                : t("settings.testAlertFailed")}
          </p>
        )}
        {!config.alert.enabled && (
          <p className="text-xs text-[var(--text-muted)]">{t("settings.alertDisabledHint")}</p>
        )}
        <div className="mt-2 border-t border-[var(--border-primary)] pt-2">
          <button
            type="button"
            onClick={() => setTgLogOpen((v) => !v)}
            className="flex w-full items-center justify-between text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <span>{t("settings.tgLogTitle")}</span>
            <span>{tgLogOpen ? "▾" : "▸"}</span>
          </button>
          {tgLogOpen && (
            <div className="mt-2">
              <TelegramLogList />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

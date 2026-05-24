"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import { useLanguage } from "@/components/LanguageProvider";
import { sendAlertTest } from "@/lib/api";

export default function AlertTestCard({ enabled }: { enabled: boolean }) {
  const { t } = useLanguage();
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<"sent" | "notConfigured" | "failed" | null>(null);

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
    <Card>
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {t("settings.testAlert")}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {t("settings.alertDisabledHint")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSendTest()}
          disabled={testSending || !enabled}
          className="ml-4 shrink-0 rounded-md px-4 py-2 text-xs font-medium transition disabled:opacity-50"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "var(--text-primary)",
          }}
        >
          {testSending ? t("settings.testingAlert") : t("settings.testAlert")}
        </button>
      </div>
      {testResult && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {testResult === "sent"
            ? t("settings.testAlertSent")
            : testResult === "notConfigured"
              ? t("settings.testAlertNotConfigured")
              : t("settings.testAlertFailed")}
        </p>
      )}
    </Card>
  );
}

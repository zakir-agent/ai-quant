"use client";

import Card from "@/components/ui/Card";
import { useLanguage } from "@/components/LanguageProvider";
import TelegramLogList from "./TelegramLogList";

export default function AlertLogCard() {
  const { t } = useLanguage();

  return (
    <Card title={t("settings.tgLogTitle")}>
      <TelegramLogList />
    </Card>
  );
}

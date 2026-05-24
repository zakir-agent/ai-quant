"use client";

import AlertStatusCard from "./AlertStatusCard";
import AlertThresholdCard from "./AlertThresholdCard";
import AlertTestCard from "./AlertTestCard";
import AlertLogCard from "./AlertLogCard";
import type { AppConfig } from "@/lib/api";

export default function AlertingCard({ config }: { config: AppConfig }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AlertStatusCard config={config} />
        <AlertThresholdCard config={config} />
      </div>
      <AlertTestCard enabled={config.alert.enabled} />
      <AlertLogCard />
    </div>
  );
}

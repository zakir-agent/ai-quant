"use client";

import Card from "@/components/ui/Card";
import type { AccuracyStats } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

interface Props {
  stats: AccuracyStats | null;
  onClick?: () => void;
}

export default function AccuracyCard({ stats, onClick }: Props) {
  const t = useT();

  const pct7d = stats?.["7d"]?.accuracy_pct;
  const pct30d = stats?.["30d"]?.accuracy_pct;
  const news7d = stats?.news?.["7d"]?.accuracy_pct;

  return (
    <Card title={t("analysis.accuracyTrend")} className="cursor-pointer" onClick={onClick}>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-2xl font-bold">{pct7d != null ? `${pct7d.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t("analysis.accuracy7d")}</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{pct30d != null ? `${pct30d.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t("analysis.accuracy30d")}</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{news7d != null ? `${news7d.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t("analysis.accuracyNews")}</p>
        </div>
      </div>
    </Card>
  );
}

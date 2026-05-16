"use client";

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
    <div
      className="col-span-2 cursor-pointer rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4 transition-all hover:-translate-y-0.5 hover:border-white/12"
      onClick={onClick}
    >
      <p className="mb-2 text-xs text-neutral-500">{t("analysis.accuracyTrend")}</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-2xl font-bold">{pct7d != null ? `${pct7d.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-neutral-400">{t("analysis.accuracy7d")}</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{pct30d != null ? `${pct30d.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-neutral-400">{t("analysis.accuracy30d")}</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{news7d != null ? `${news7d.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-neutral-400">{t("analysis.accuracyNews")}</p>
        </div>
      </div>
    </div>
  );
}

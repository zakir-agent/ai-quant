"use client";

import Card from "@/components/ui/Card";
import type { AccuracyPeriodStats, AccuracyStats } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

interface Props {
  stats: AccuracyStats | null;
  className?: string;
}

function BaselineDelta({ period }: { period: AccuracyPeriodStats | undefined }) {
  const t = useT();
  const baseline = period?.baseline_accuracy_pct;
  const excess = period?.excess_accuracy_pct;
  if (baseline == null) return null;
  return (
    <p className="text-xs text-[var(--text-muted)]">
      {t("analysis.vsBaseline")} {baseline.toFixed(1)}%
      {excess != null && (
        <span
          className="ml-1"
          style={{ color: excess >= 0 ? "var(--success)" : "var(--danger)" }}
        >
          ({excess >= 0 ? "+" : ""}
          {excess.toFixed(1)})
        </span>
      )}
    </p>
  );
}

const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

function ConfidenceCalibration({ period }: { period: AccuracyPeriodStats | undefined }) {
  const t = useT();
  const buckets = period?.by_confidence;
  return (
    <div>
      <p className="mb-1.5 text-xs text-[var(--text-muted)]">
        {t("analysis.confidenceCalibration")}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {CONFIDENCE_LEVELS.map((level) => {
          const bucket = buckets?.[level];
          return (
            <div key={level}>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {bucket?.accuracy_pct != null ? `${bucket.accuracy_pct.toFixed(1)}%` : "—"}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {t(`analysis.${level}`)}
                {bucket && bucket.count > 0 ? ` · ${bucket.count}` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AccuracyCard({ stats, className }: Props) {
  const t = useT();

  const period7d = stats?.["7d"];
  const period30d = stats?.["30d"];
  const pct7d = period7d?.accuracy_pct;
  const pct30d = period30d?.accuracy_pct;
  const news7d = stats?.news?.["7d"]?.accuracy_pct;
  const flatCount = (period7d?.flat_count ?? 0) + (period30d?.flat_count ?? 0);

  return (
    <Card title={t("analysis.accuracyTrend")} className={className}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-2xl font-bold">{pct7d != null ? `${pct7d.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t("analysis.accuracy7d")}</p>
          <BaselineDelta period={period7d} />
        </div>
        <div>
          <p className="text-2xl font-bold">{pct30d != null ? `${pct30d.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t("analysis.accuracy30d")}</p>
          <BaselineDelta period={period30d} />
        </div>
        <div>
          <p className="text-2xl font-bold">{news7d != null ? `${news7d.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-[var(--text-secondary)]">{t("analysis.accuracyNews")}</p>
        </div>
      </div>
      <div className="mt-3 border-t border-[var(--border-primary)] pt-3">
        <ConfidenceCalibration period={period30d ?? period7d} />
        {flatCount > 0 && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {flatCount} {t("analysis.flatExcluded")}
          </p>
        )}
      </div>
    </Card>
  );
}

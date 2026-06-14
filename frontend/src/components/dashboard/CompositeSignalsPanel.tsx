"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ErrorBlock from "@/components/ui/ErrorBlock";
import { useT } from "@/components/LanguageProvider";
import {
  getRecentSignals,
  getSignalAccuracy,
  getSignalWeights,
  type CompositeSignal,
  type CompositeSignalLevel,
  type SignalAccuracyStats,
  type SignalWeights,
} from "@/lib/api";

const SIGNAL_BADGE_VARIANT: Record<
  CompositeSignalLevel,
  "success" | "danger" | "warning" | "info" | "default"
> = {
  strong_buy: "success",
  buy: "success",
  neutral: "default",
  sell: "danger",
  strong_sell: "danger",
};

const COMPONENT_KEYS = ["technical", "ai_sentiment", "fear_greed", "futures"] as const;

function scoreColor(score: number): string {
  if (score > 0) return "var(--success)";
  if (score < 0) return "var(--danger)";
  return "var(--text-muted)";
}

function SignalRow({ signal }: { signal: CompositeSignal }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[var(--border-primary)] last:border-b-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--bg-card-hover)]"
      >
        <span className="text-[var(--text-muted)]">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="w-24 shrink-0 text-sm font-medium text-[var(--text-primary)]">
          {signal.symbol}
        </span>
        <Badge variant={SIGNAL_BADGE_VARIANT[signal.signal]}>
          {t(`dashboard.signalLabels.${signal.signal}`)}
        </Badge>
        <span
          className="ml-auto text-sm font-semibold tabular-nums"
          style={{ color: scoreColor(signal.composite_score) }}
        >
          {signal.composite_score > 0 ? "+" : ""}
          {signal.composite_score.toFixed(1)}
        </span>
        <span className="w-14 shrink-0 text-right text-xs text-[var(--text-secondary)]">
          {t(`analysis.${signal.confidence}`)}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 px-9 pb-3">
          {COMPONENT_KEYS.map((key) => {
            const comp = signal.components[key];
            if (!comp) return null;
            const reasons = comp.reasons?.length ? comp.reasons : comp.source ? [comp.source] : [];
            return (
              <div key={key} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-[var(--text-secondary)]">
                    {t(`dashboard.signalComponents.${key}`)}
                  </span>
                  <span className="font-medium tabular-nums" style={{ color: scoreColor(comp.score) }}>
                    {comp.score > 0 ? "+" : ""}
                    {comp.score.toFixed(1)}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    × {(comp.weight * 100).toFixed(0)}%
                  </span>
                </div>
                {reasons.length > 0 && (
                  <ul className="mt-1 ml-28 list-disc space-y-0.5 pl-4 text-[var(--text-muted)]">
                    {reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CompositeSignalsPanel() {
  const t = useT();
  const [signals, setSignals] = useState<CompositeSignal[] | null>(null);
  const [accuracy, setAccuracy] = useState<SignalAccuracyStats | null>(null);
  const [weights, setWeights] = useState<SignalWeights | null>(null);
  const [error, setError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const recent = await getRecentSignals();
      setSignals(recent.signals);
    } catch {
      setError(true);
      return;
    }
    // Accuracy and weights are supplementary — failures only hide their sections
    try {
      setAccuracy(await getSignalAccuracy());
    } catch {
      // ignore
    }
    try {
      setWeights(await getSignalWeights());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadData(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch
  }, [loadData]);

  const handleRetry = useCallback(() => {
    setError(false);
    setSignals(null);
    loadData();
  }, [loadData]);

  const hitRate7d = accuracy?.["7d"];
  const showHitRate = hitRate7d != null && hitRate7d.total_scored > 0 && hitRate7d.accuracy_pct != null;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase">
          {t("dashboard.compositeSignals")}
        </h3>
        {showHitRate && (
          <span className="text-xs text-[var(--text-secondary)]">
            {t("dashboard.signalHitRate7d")} {hitRate7d.accuracy_pct!.toFixed(1)}%
          </span>
        )}
      </div>

      {error ? (
        <ErrorBlock message={t("common.loadFailed")} onRetry={handleRetry} />
      ) : signals === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
          ))}
        </div>
      ) : signals.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--text-muted)]">
          {t("dashboard.noSignals")}
        </p>
      ) : (
        <div>
          {signals.map((signal) => (
            <SignalRow key={signal.id} signal={signal} />
          ))}
        </div>
      )}

      {weights && (
        <p className="mt-3 border-t border-[var(--border-primary)] pt-2 text-xs text-[var(--text-muted)]">
          {weights.weights_source === "tuned" ? (
            <>
              {t("dashboard.weightsTuned")}
              {" · "}
              {COMPONENT_KEYS.map(
                (key) =>
                  `${t(`dashboard.signalComponents.${key}`)} ${(weights.weights[key] * 100).toFixed(0)}%`,
              ).join(" / ")}
            </>
          ) : (
            t("dashboard.weightsDefault")
          )}
        </p>
      )}
    </Card>
  );
}

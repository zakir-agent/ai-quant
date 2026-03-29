"use client";

import { useState } from "react";
import { runAnalysis, type AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import Badge from "@/components/ui/Badge";

function SentimentGauge({ score, t }: { score: number; t: (key: string) => string }) {
  const color = score > 30 ? "var(--success)" : score < -30 ? "var(--danger)" : "var(--warning)";
  const label =
    score > 30
      ? t("analysis.bullish")
      : score < -30
        ? t("analysis.bearish")
        : t("analysis.neutral");
  return (
    <div className="text-center">
      <p className="text-4xl font-bold" style={{ color }}>
        {score}
      </p>
      <p className="text-sm" style={{ color }}>
        {label}
      </p>
    </div>
  );
}

interface AnalysisPanelProps {
  report: AnalysisReport | null;
  onRefresh: () => void;
}

export default function AnalysisPanel({ report, onRefresh }: AnalysisPanelProps) {
  const t = useT();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      await runAnalysis();
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const trendVariant = (trend: string): "success" | "danger" | "warning" => {
    if (trend === "bullish") return "success";
    if (trend === "bearish") return "danger";
    return "warning";
  };

  const trendLabel = (trend: string): string => {
    if (trend === "bullish") return t("analysis.bullish");
    if (trend === "bearish") return t("analysis.bearish");
    return t("analysis.neutral");
  };

  const riskVariant = (level: string): "success" | "danger" | "warning" => {
    if (level === "low") return "success";
    if (level === "high") return "danger";
    return "warning";
  };

  const riskLabel = (level: string): string => {
    if (level === "low") return t("analysis.riskLow");
    if (level === "high") return t("analysis.riskHigh");
    return t("analysis.riskMedium");
  };

  const actionColor = (action: string): string => {
    const map: Record<string, string> = {
      buy: "var(--success)",
      sell: "var(--danger)",
      hold: "var(--warning)",
      watch: "var(--accent-primary)",
    };
    return map[action] || "var(--text-muted)";
  };

  const actionLabel = (action: string): string => {
    const map: Record<string, string> = {
      buy: t("analysis.buy"),
      sell: t("analysis.sell"),
      hold: t("analysis.hold"),
      watch: t("analysis.watch"),
    };
    return map[action] || action;
  };

  const confidenceLabel = (c: string): string => {
    if (c === "high") return t("analysis.high");
    if (c === "medium") return t("analysis.medium");
    return t("analysis.low");
  };

  return (
    <div className="flex flex-1 flex-col space-y-4 overflow-auto">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          {report && (
            <>
              <Badge variant={trendVariant(report.trend)} size="md">
                {trendLabel(report.trend)}
              </Badge>
              <Badge variant={riskVariant(report.risk_level)} size="md">
                {riskLabel(report.risk_level)}
              </Badge>
            </>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: running ? "var(--text-muted)" : "var(--accent-primary)",
          }}
        >
          {running ? t("analysis.running") : t("analysis.runAi")}
        </button>
      </div>

      {error && (
        <p
          className="rounded px-3 py-2 text-sm"
          style={{
            backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)",
            color: "var(--danger)",
          }}
        >
          {error}
        </p>
      )}

      {!report && !running && (
        <p className="py-8 text-center text-[var(--text-muted)]">{t("analysis.noReport")}</p>
      )}

      {report && (
        <div className="space-y-4">
          {/* Sentiment + Summary */}
          <div className="grid grid-cols-[100px_1fr] gap-4">
            <SentimentGauge score={report.sentiment_score} t={t} />
            <div>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {report.summary}
              </p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {t("analysis.model")}: {report.model_used} |
                {report.token_usage &&
                  ` ${t("analysis.cost")}: $${report.token_usage.cost_usd.toFixed(4)} |`}{" "}
                {t("analysis.time")}: {new Date(report.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Recommendations */}
          {report.recommendations && report.recommendations.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
                {t("analysis.recommendations")}
              </h4>
              <div className="space-y-2">
                {report.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="rounded p-3 text-sm"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                    }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{rec.symbol}</span>
                      <span style={{ color: actionColor(rec.action) }}>
                        {actionLabel(rec.action)}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {t("analysis.confidence")}: {confidenceLabel(rec.confidence)}
                      </span>
                    </div>
                    <p className="text-[var(--text-secondary)]">{rec.reason}</p>
                    {(rec.target_price || rec.stop_loss) && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {rec.target_price && `${t("analysis.target")}: $${rec.target_price}`}
                        {rec.target_price && rec.stop_loss && " | "}
                        {rec.stop_loss && `${t("analysis.stopLoss")}: $${rec.stop_loss}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk Warnings */}
          {report.risk_warnings && report.risk_warnings.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
                {t("analysis.riskWarnings")}
              </h4>
              <ul className="space-y-1 text-sm" style={{ color: "var(--danger)" }}>
                {report.risk_warnings.map((w, i) => (
                  <li key={i}>- {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

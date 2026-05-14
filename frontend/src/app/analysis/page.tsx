"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  getAnalysisHistory,
  runAnalysis,
  getAnalysisSymbols,
  type AnalysisReport,
} from "@/lib/api";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ErrorBlock from "@/components/ui/ErrorBlock";
import { useT, useLanguage } from "@/components/LanguageProvider";
import {
  trendVariant,
  trendLabel,
  riskVariant,
  riskLabel,
  actionColor,
  actionLabel,
  confidenceLabel,
  sentimentColor,
} from "@/lib/analysis-helpers";

/** Short label for tabs: ``BTC/USDT`` → ``BTC``. */
function scopeDisplayLabel(scope: string): string {
  const slash = scope.indexOf("/");
  return slash >= 0 ? scope.slice(0, slash) : scope;
}

export default function AnalysisPage() {
  const t = useT();
  const { locale } = useLanguage();
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [selected, setSelected] = useState<AnalysisReport | null>(null);
  const [running, setRunning] = useState(false);
  const [scope, setScope] = useState("market");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAnalysisSymbols()
      .then((r) => {
        const unique = [...new Set(r.symbols)].sort();
        setSymbols(unique);
        setScope((prev) => (prev === "market" || unique.includes(prev) ? prev : "market"));
      })
      .catch(() => {});
  }, []);

  const loadHistory = useCallback(() => {
    setError(null);
    getAnalysisHistory(scope, 20)
      .then((r) => {
        setReports(r.reports);
        setSelected(null);
      })
      .catch(() => setError("loadFailed"));
  }, [scope]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await runAnalysis(scope);
      setSelected(result);
      loadHistory();
    } catch {
      toast.error(t("analysis.failPrefix"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("analysis.title")}</h2>
          <div className="max-w-[70vw] overflow-x-auto">
            <div
              className="inline-flex min-w-max rounded-lg border border-[var(--border-primary)] p-1"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              {[
                { key: "market", label: t("analysis.marketWide") },
                ...symbols.map((s) => ({ key: s, label: scopeDisplayLabel(s) })),
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setScope(tab.key)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    scope === tab.key
                      ? "text-white shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                  style={
                    scope === tab.key
                      ? { background: "var(--accent-gradient, var(--accent-primary))" }
                      : undefined
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={running || !scope}
          className="rounded-lg px-4 py-2 text-sm text-white transition-colors disabled:opacity-50"
          style={{
            background: running
              ? "var(--bg-secondary)"
              : "var(--accent-gradient, var(--accent-primary))",
          }}
        >
          {running ? t("analysis.running") : t("analysis.runNew")}
        </button>
      </div>

      {error && (
        <ErrorBlock
          message={t("common.loadFailed")}
          onRetry={loadHistory}
          retryLabel={t("common.retry")}
        />
      )}

      <div className="grid grid-cols-[350px_1fr] gap-6">
        {/* History list */}
        <Card className="max-h-[700px] overflow-y-auto">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">
            {t("analysis.history")}
          </h3>
          {reports.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">{t("analysis.noHistory")}</p>
          )}
          <div className="space-y-2">
            <AnimatePresence>
              {reports.map((r) => (
                <motion.button
                  key={r.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setSelected(r)}
                  className={`w-full rounded-lg border-l-2 p-3 text-left transition-all ${
                    selected?.id === r.id
                      ? "border-l-[var(--accent-primary)] bg-[var(--bg-card-hover)] shadow-[0_0_12px_rgba(var(--accent-primary-rgb,99,102,241),0.15)]"
                      : "border-l-transparent bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)]"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <Badge variant={trendVariant(r.trend)}>{trendLabel(r.trend, t)}</Badge>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 w-16 rounded-full"
                        style={{ backgroundColor: "var(--bg-secondary)" }}
                      >
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${((r.sentiment_score + 100) / 200) * 100}%`,
                            backgroundColor: sentimentColor(r.sentiment_score),
                          }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-xs text-[var(--text-muted)]">
                        {r.sentiment_score}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {new Date(r.created_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")} ·{" "}
                    {r.model_used}
                  </p>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </Card>

        {/* Detail panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selected?.id || "empty"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              {!selected ? (
                <p className="py-20 text-center text-[var(--text-muted)]">
                  {t("analysis.selectRecord")}
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="text-3xl font-bold"
                      style={{ color: sentimentColor(selected.sentiment_score) }}
                    >
                      {selected.sentiment_score > 0 ? "+" : ""}
                      {selected.sentiment_score}
                    </span>
                    <Badge variant={trendVariant(selected.trend)}>
                      {trendLabel(selected.trend, t)}
                    </Badge>
                    <Badge variant={riskVariant(selected.risk_level)}>
                      {riskLabel(selected.risk_level, t)}
                    </Badge>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      {new Date(selected.created_at).toLocaleString(
                        locale === "zh" ? "zh-CN" : "en-US",
                      )}
                    </span>
                  </div>

                  <div>
                    <h4 className="mb-1 text-sm font-semibold text-[var(--text-muted)]">
                      {t("analysis.summary")}
                    </h4>
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                      {selected.summary}
                    </p>
                  </div>

                  {selected.key_observations && selected.key_observations.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
                        {t("analysis.keyObservations")}
                      </h4>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
                        {selected.key_observations.map((obs, i) => (
                          <li key={i}>{obs}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selected.technical_analysis && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
                        {t("analysis.technicalAnalysis")}
                      </h4>
                      <div className="mb-3 grid grid-cols-3 gap-3">
                        {(["1h", "4h", "1d"] as const).map((tf) => {
                          const trend = selected.technical_analysis![
                            `trend_${tf}` as keyof typeof selected.technical_analysis
                          ] as string;
                          const icon =
                            trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192";
                          const color =
                            trend === "up"
                              ? "var(--success)"
                              : trend === "down"
                                ? "var(--danger)"
                                : "var(--warning)";
                          return (
                            <div
                              key={tf}
                              className="rounded-lg p-2 text-center"
                              style={{ backgroundColor: "var(--bg-secondary)" }}
                            >
                              <div className="text-xs text-[var(--text-muted)]">{tf}</div>
                              <div className="text-lg font-bold" style={{ color }}>
                                {icon}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div
                          className="rounded-lg p-2"
                          style={{ backgroundColor: "var(--bg-secondary)" }}
                        >
                          <span className="text-[var(--text-muted)]">
                            {t("analysis.support")}:{" "}
                          </span>
                          <span className="text-[var(--success)]">
                            {selected.technical_analysis.support_levels
                              ?.map((v) => `$${v.toLocaleString()}`)
                              .join(" / ") || "-"}
                          </span>
                        </div>
                        <div
                          className="rounded-lg p-2"
                          style={{ backgroundColor: "var(--bg-secondary)" }}
                        >
                          <span className="text-[var(--text-muted)]">
                            {t("analysis.resistance")}:{" "}
                          </span>
                          <span className="text-[var(--danger)]">
                            {selected.technical_analysis.resistance_levels
                              ?.map((v) => `$${v.toLocaleString()}`)
                              .join(" / ") || "-"}
                          </span>
                        </div>
                      </div>
                      {selected.technical_analysis.key_observation && (
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">
                          {selected.technical_analysis.key_observation}
                        </p>
                      )}
                    </div>
                  )}

                  {selected.recommendations && selected.recommendations.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
                        {t("analysis.recommendations")}
                      </h4>
                      <div className="space-y-2">
                        {selected.recommendations.map((rec, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.15, delay: i * 0.05 }}
                            className="rounded-lg p-3 text-sm"
                            style={{ backgroundColor: "var(--bg-secondary)" }}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              {rec.symbol && (
                                <span className="font-medium text-[var(--text-primary)]">
                                  {rec.symbol}
                                </span>
                              )}
                              <span style={{ color: actionColor(rec.action) }}>
                                {actionLabel(rec.action, t)}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {t("analysis.confidence")}: {confidenceLabel(rec.confidence, t)}
                              </span>
                            </div>
                            <p className="text-[var(--text-secondary)]">{rec.reason}</p>
                            {(rec.entry_price || rec.target_price || rec.stop_loss) && (
                              <p className="mt-1 text-xs text-[var(--text-muted)]">
                                {rec.entry_price && `${t("analysis.entry")}: $${rec.entry_price}`}
                                {rec.entry_price && (rec.target_price || rec.stop_loss) && " | "}
                                {rec.target_price &&
                                  `${t("analysis.target")}: $${rec.target_price}`}
                                {rec.target_price && rec.stop_loss && " | "}
                                {rec.stop_loss && `${t("analysis.stopLoss")}: $${rec.stop_loss}`}
                              </p>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selected.risk_warnings && selected.risk_warnings.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
                        {t("analysis.riskWarnings")}
                      </h4>
                      <ul className="space-y-1 text-sm" style={{ color: "var(--danger)" }}>
                        {selected.risk_warnings.map((w, i) => (
                          <li key={i}>- {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selected.accuracy?.scored && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
                        {t("analysis.accuracy")}
                      </h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {t("analysis.accuracyPct")}:{" "}
                        <span className="font-mono">{selected.accuracy.accuracy_pct ?? "-"}%</span>
                        {" · "}
                        {t("analysis.accuracyWindow")}: {selected.accuracy.window_hours}h
                      </p>
                    </div>
                  )}

                  <div
                    className="pt-3 text-xs text-[var(--text-muted)]"
                    style={{ borderTop: "1px solid var(--border-primary)" }}
                  >
                    {t("analysis.model")}: {selected.model_used}
                    {selected.token_usage && (
                      <>
                        {" · "}
                        {t("analysis.tokens")}: {selected.token_usage.input}+
                        {selected.token_usage.output}
                        {" · "}
                        {t("analysis.cost")}: ${selected.token_usage.cost_usd.toFixed(4)}
                      </>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAnalysisHistory, runAnalysis, getPairs, type AnalysisReport } from "@/lib/api";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { useT } from "@/components/LanguageProvider";

export default function AnalysisPage() {
  const t = useT();
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [selected, setSelected] = useState<AnalysisReport | null>(null);
  const [running, setRunning] = useState(false);
  const [scope, setScope] = useState("market");
  const [symbols, setSymbols] = useState<string[]>([]);

  useEffect(() => {
    getPairs()
      .then((r) => {
        const all = Object.values(r.pairs).flat();
        const unique = [...new Set(all)].sort();
        setSymbols(unique);
      })
      .catch(() => {});
  }, []);

  const loadHistory = () => {
    getAnalysisHistory(scope, 20).then((r) => {
      setReports(r.reports);
      setSelected(null);
    }).catch(() => {});
  };

  useEffect(loadHistory, [scope]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await runAnalysis(scope);
      setSelected(result);
      loadHistory();
    } catch (e) {
      alert(t("analysis.failPrefix") + (e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const trendVariant = (trend: string): "success" | "danger" | "warning" => {
    if (trend === "bullish") return "success";
    if (trend === "bearish") return "danger";
    return "warning";
  };

  const trendLabel = (trend: string) => {
    if (trend === "bullish") return t("analysis.bullish");
    if (trend === "bearish") return t("analysis.bearish");
    return t("analysis.neutral");
  };

  const riskVariant = (level: string): "success" | "warning" | "danger" => {
    if (level === "low") return "success";
    if (level === "medium") return "warning";
    return "danger";
  };

  const riskLabel = (level: string) => {
    if (level === "low") return t("analysis.riskLow");
    if (level === "medium") return t("analysis.riskMedium");
    return t("analysis.riskHigh");
  };

  const actionColor = (action: string) => {
    const colors: Record<string, string> = {
      buy: "var(--success)",
      sell: "var(--danger)",
      hold: "var(--warning)",
      watch: "var(--accent-primary)",
    };
    return colors[action] || "var(--text-muted)";
  };

  const actionLabel = (action: string) => {
    const labels: Record<string, string> = {
      buy: t("analysis.buy"),
      sell: t("analysis.sell"),
      hold: t("analysis.hold"),
      watch: t("analysis.watch"),
    };
    return labels[action] || action;
  };

  const confidenceLabel = (c: string) => {
    if (c === "high") return t("analysis.high");
    if (c === "medium") return t("analysis.medium");
    return t("analysis.low");
  };

  const sentimentColor = (score: number) => {
    if (score > 30) return "var(--success)";
    if (score < -30) return "var(--danger)";
    return "var(--warning)";
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t("analysis.title")}</h2>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-primary)]"
          >
            <option value="market">{t("analysis.marketWide")}</option>
            {symbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="px-4 py-2 text-sm rounded-lg transition-colors text-white disabled:opacity-50"
          style={{
            background: running ? "var(--bg-secondary)" : "var(--accent-gradient, var(--accent-primary))",
          }}
        >
          {running ? t("analysis.running") : t("analysis.runNew")}
        </button>
      </div>

      <div className="grid grid-cols-[350px_1fr] gap-6">
        {/* History list */}
        <Card className="max-h-[700px] overflow-y-auto">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] mb-3">{t("analysis.history")}</h3>
          {reports.length === 0 && (
            <p className="text-[var(--text-muted)] text-sm">{t("analysis.noHistory")}</p>
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
                  className={`w-full text-left p-3 rounded-lg transition-all border-l-2 ${
                    selected?.id === r.id
                      ? "border-l-[var(--accent-primary)] bg-[var(--bg-card-hover)] shadow-[0_0_12px_rgba(var(--accent-primary-rgb,99,102,241),0.15)]"
                      : "border-l-transparent bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant={trendVariant(r.trend)}>{trendLabel(r.trend)}</Badge>
                    <div className="flex items-center gap-2">
                      <div className="w-16 rounded-full h-1.5" style={{ backgroundColor: "var(--bg-secondary)" }}>
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${((r.sentiment_score + 100) / 200) * 100}%`,
                            backgroundColor: sentimentColor(r.sentiment_score),
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono text-[var(--text-muted)] w-8 text-right">
                        {r.sentiment_score}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {new Date(r.created_at).toLocaleString("zh-CN")} · {r.model_used}
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
                <p className="text-[var(--text-muted)] text-center py-20">{t("analysis.selectRecord")}</p>
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
                    <Badge variant={trendVariant(selected.trend)}>{trendLabel(selected.trend)}</Badge>
                    <Badge variant={riskVariant(selected.risk_level)}>{riskLabel(selected.risk_level)}</Badge>
                    <span className="text-xs text-[var(--text-muted)] ml-auto">
                      {new Date(selected.created_at).toLocaleString("zh-CN")}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[var(--text-muted)] mb-1">{t("analysis.summary")}</h4>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{selected.summary}</p>
                  </div>

                  {selected.technical_analysis && (
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--text-muted)] mb-2">{t("analysis.technicalAnalysis")}</h4>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        {(["1h", "4h", "1d"] as const).map((tf) => {
                          const trend = selected.technical_analysis![`trend_${tf}` as keyof typeof selected.technical_analysis] as string;
                          const icon = trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192";
                          const color = trend === "up" ? "var(--success)" : trend === "down" ? "var(--danger)" : "var(--warning)";
                          return (
                            <div key={tf} className="rounded-lg p-2 text-center" style={{ backgroundColor: "var(--bg-secondary)" }}>
                              <div className="text-xs text-[var(--text-muted)]">{tf}</div>
                              <div className="text-lg font-bold" style={{ color }}>{icon}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg p-2" style={{ backgroundColor: "var(--bg-secondary)" }}>
                          <span className="text-[var(--text-muted)]">{t("analysis.support")}: </span>
                          <span className="text-[var(--success)]">
                            {selected.technical_analysis.support_levels?.map((v) => `$${v.toLocaleString()}`).join(" / ") || "-"}
                          </span>
                        </div>
                        <div className="rounded-lg p-2" style={{ backgroundColor: "var(--bg-secondary)" }}>
                          <span className="text-[var(--text-muted)]">{t("analysis.resistance")}: </span>
                          <span className="text-[var(--danger)]">
                            {selected.technical_analysis.resistance_levels?.map((v) => `$${v.toLocaleString()}`).join(" / ") || "-"}
                          </span>
                        </div>
                      </div>
                      {selected.technical_analysis.key_observation && (
                        <p className="text-sm text-[var(--text-secondary)] mt-2">{selected.technical_analysis.key_observation}</p>
                      )}
                    </div>
                  )}

                  {selected.recommendations && selected.recommendations.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--text-muted)] mb-2">{t("analysis.recommendations")}</h4>
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
                            <div className="flex items-center gap-2 mb-1">
                              {rec.symbol && <span className="font-medium text-[var(--text-primary)]">{rec.symbol}</span>}
                              <span style={{ color: actionColor(rec.action) }}>
                                {actionLabel(rec.action)}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {t("analysis.confidence")}: {confidenceLabel(rec.confidence)}
                              </span>
                            </div>
                            <p className="text-[var(--text-secondary)]">{rec.reason}</p>
                            {(rec.entry_price || rec.target_price || rec.stop_loss) && (
                              <p className="text-xs text-[var(--text-muted)] mt-1">
                                {rec.entry_price && `${t("analysis.entry")}: $${rec.entry_price}`}
                                {rec.entry_price && (rec.target_price || rec.stop_loss) && " | "}
                                {rec.target_price && `${t("analysis.target")}: $${rec.target_price}`}
                                {rec.target_price && rec.stop_loss && " | "}
                                {rec.stop_loss && `${t("analysis.stopLoss")}: $${rec.stop_loss}`}
                              </p>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div
                    className="text-xs text-[var(--text-muted)] pt-3"
                    style={{ borderTop: "1px solid var(--border-primary)" }}
                  >
                    {t("analysis.model")}: {selected.model_used}
                    {selected.token_usage && (
                      <>
                        {" · "}{t("analysis.tokens")}: {selected.token_usage.input}+{selected.token_usage.output}
                        {" · "}{t("analysis.cost")}: ${selected.token_usage.cost_usd.toFixed(4)}
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

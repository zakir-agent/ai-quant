"use client";

import { useState } from "react";
import { runAnalysis, type AnalysisReport } from "@/lib/api";

function SentimentGauge({ score }: { score: number }) {
  const color =
    score > 30 ? "text-green-400" : score < -30 ? "text-red-400" : "text-yellow-400";
  const label = score > 30 ? "看多" : score < -30 ? "看空" : "中性";
  return (
    <div className="text-center">
      <p className={`text-4xl font-bold ${color}`}>{score}</p>
      <p className={`text-sm ${color}`}>{label}</p>
    </div>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  const styles: Record<string, string> = {
    bullish: "bg-green-900/50 text-green-400",
    bearish: "bg-red-900/50 text-red-400",
    neutral: "bg-yellow-900/50 text-yellow-400",
  };
  const labels: Record<string, string> = {
    bullish: "看多", bearish: "看空", neutral: "中性",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm ${styles[trend] || styles.neutral}`}>
      {labels[trend] || trend}
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    low: "bg-green-900/50 text-green-400",
    medium: "bg-yellow-900/50 text-yellow-400",
    high: "bg-red-900/50 text-red-400",
  };
  const labels: Record<string, string> = {
    low: "低风险", medium: "中风险", high: "高风险",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm ${styles[level] || styles.medium}`}>
      {labels[level] || level}
    </span>
  );
}

interface AnalysisPanelProps {
  report: AnalysisReport | null;
  onRefresh: () => void;
}

export default function AnalysisPanel({ report, onRefresh }: AnalysisPanelProps) {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {report && (
            <>
              <TrendBadge trend={report.trend} />
              <RiskBadge level={report.risk_level} />
            </>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg transition-colors"
        >
          {running ? "分析中..." : "运行 AI 分析"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded">{error}</p>
      )}

      {!report && !running && (
        <p className="text-gray-500 text-center py-8">
          暂无分析报告 — 请先采集数据，然后点击"运行 AI 分析"
        </p>
      )}

      {report && (
        <div className="space-y-4">
          {/* Sentiment + Summary */}
          <div className="grid grid-cols-[100px_1fr] gap-4">
            <SentimentGauge score={report.sentiment_score} />
            <div>
              <p className="text-sm text-gray-300 leading-relaxed">{report.summary}</p>
              <p className="text-xs text-gray-500 mt-2">
                模型: {report.model_used} |
                {report.token_usage && ` 成本: $${report.token_usage.cost_usd.toFixed(4)} |`}
                {" "}时间: {new Date(report.created_at).toLocaleString("zh-CN")}
              </p>
            </div>
          </div>

          {/* Recommendations */}
          {report.recommendations && report.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-400 mb-2">交易建议</h4>
              <div className="space-y-2">
                {report.recommendations.map((rec, i) => {
                  const actionColors: Record<string, string> = {
                    buy: "text-green-400", sell: "text-red-400",
                    hold: "text-yellow-400", watch: "text-blue-400",
                  };
                  const actionLabels: Record<string, string> = {
                    buy: "买入", sell: "卖出", hold: "持有", watch: "观望",
                  };
                  return (
                    <div key={i} className="bg-gray-800 rounded p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{rec.symbol}</span>
                        <span className={actionColors[rec.action] || "text-gray-400"}>
                          {actionLabels[rec.action] || rec.action}
                        </span>
                        <span className="text-xs text-gray-500">
                          信心: {rec.confidence === "high" ? "高" : rec.confidence === "medium" ? "中" : "低"}
                        </span>
                      </div>
                      <p className="text-gray-400">{rec.reason}</p>
                      {(rec.target_price || rec.stop_loss) && (
                        <p className="text-xs text-gray-500 mt-1">
                          {rec.target_price && `目标: $${rec.target_price}`}
                          {rec.target_price && rec.stop_loss && " | "}
                          {rec.stop_loss && `止损: $${rec.stop_loss}`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Risk Warnings */}
          {report.risk_warnings && report.risk_warnings.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-400 mb-2">风险提示</h4>
              <ul className="text-sm text-red-400/80 space-y-1">
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

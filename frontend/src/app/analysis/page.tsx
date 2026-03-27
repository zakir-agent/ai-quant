"use client";

import { useEffect, useState } from "react";
import { getAnalysisHistory, runAnalysis, type AnalysisReport } from "@/lib/api";

function TrendBadge({ trend }: { trend: string }) {
  const styles: Record<string, string> = {
    bullish: "bg-green-900/50 text-green-400",
    bearish: "bg-red-900/50 text-red-400",
    neutral: "bg-yellow-900/50 text-yellow-400",
  };
  const labels: Record<string, string> = { bullish: "看多", bearish: "看空", neutral: "中性" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${styles[trend] || styles.neutral}`}>
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
  const labels: Record<string, string> = { low: "低", medium: "中", high: "高" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${styles[level] || styles.medium}`}>
      {labels[level] || level}
    </span>
  );
}

function SentimentBar({ score }: { score: number }) {
  const pct = ((score + 100) / 200) * 100;
  const color = score > 30 ? "bg-green-500" : score < -30 ? "bg-red-500" : "bg-yellow-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-gray-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{score}</span>
    </div>
  );
}

export default function AnalysisPage() {
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [selected, setSelected] = useState<AnalysisReport | null>(null);
  const [running, setRunning] = useState(false);

  const loadHistory = () => {
    getAnalysisHistory("market", 20).then((r) => setReports(r.reports));
  };

  useEffect(loadHistory, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await runAnalysis();
      setSelected(result);
      loadHistory();
    } catch (e) {
      alert("分析失败: " + (e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">AI 分析历史</h2>
        <button
          onClick={handleRun}
          disabled={running}
          className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg transition-colors"
        >
          {running ? "分析中..." : "运行新分析"}
        </button>
      </div>

      <div className="grid grid-cols-[350px_1fr] gap-6">
        {/* History list */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 max-h-[700px] overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">历史记录</h3>
          {reports.length === 0 && (
            <p className="text-gray-500 text-sm">暂无分析记录</p>
          )}
          <div className="space-y-2">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full text-left p-3 rounded transition-colors ${
                  selected?.id === r.id ? "bg-gray-700" : "bg-gray-800/50 hover:bg-gray-800"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <TrendBadge trend={r.trend} />
                  <SentimentBar score={r.sentiment_score} />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(r.created_at).toLocaleString("zh-CN")} · {r.model_used}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
          {!selected ? (
            <p className="text-gray-500 text-center py-20">选择一条分析记录查看详情</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold">
                  {selected.sentiment_score > 0 ? "+" : ""}
                  {selected.sentiment_score}
                </span>
                <TrendBadge trend={selected.trend} />
                <RiskBadge level={selected.risk_level} />
                <span className="text-xs text-gray-500 ml-auto">
                  {new Date(selected.created_at).toLocaleString("zh-CN")}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-400 mb-1">分析摘要</h4>
                <p className="text-sm text-gray-300 leading-relaxed">{selected.summary}</p>
              </div>

              {selected.recommendations && selected.recommendations.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-400 mb-2">交易建议</h4>
                  <div className="space-y-2">
                    {selected.recommendations.map((rec, i) => {
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

              <div className="text-xs text-gray-500 border-t border-gray-800 pt-3">
                模型: {selected.model_used}
                {selected.token_usage && (
                  <> · Tokens: {selected.token_usage.input}+{selected.token_usage.output} · 成本: ${selected.token_usage.cost_usd.toFixed(4)}</>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { getConfig, getSystemStatus, getSchedulerStatus } from "@/lib/api";

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-red-400"}`} />;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">{title}</h3>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [config, setConfig] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [scheduler, setScheduler] = useState<any>(null);

  useEffect(() => {
    Promise.all([getConfig(), getSystemStatus(), getSchedulerStatus()]).then(
      ([c, s, sch]) => {
        setConfig(c);
        setStatus(s);
        setScheduler(sch);
      }
    );
  }, []);

  if (!config || !status) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">设置</h2>
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">设置</h2>

      <div className="grid grid-cols-2 gap-6">
        {/* AI Config */}
        <Card title="AI 模型配置">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">主模型</span>
              <span className="font-mono">{config.ai.primary_model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">备用模型</span>
              <span className="font-mono">{config.ai.fallback_model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">快速模型</span>
              <span className="font-mono">{config.ai.fast_model}</span>
            </div>
            {config.ai.custom_model && (
              <div className="flex justify-between">
                <span className="text-gray-400">自定义模型</span>
                <span className="font-mono">{config.ai.custom_model}</span>
              </div>
            )}
            {config.ai.custom_base_url && (
              <div className="flex justify-between">
                <span className="text-gray-400">自定义端点</span>
                <span className="font-mono text-xs">{config.ai.custom_base_url}</span>
              </div>
            )}
            <div className="border-t border-gray-800 pt-2 mt-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Anthropic Key</span>
                <StatusDot ok={config.ai.has_anthropic_key} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">OpenAI Key</span>
                <StatusDot ok={config.ai.has_openai_key} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Custom Key</span>
                <StatusDot ok={config.ai.has_custom_key} />
              </div>
            </div>
          </div>
        </Card>

        {/* AI Usage Today */}
        <Card title="AI 使用量（今日）">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">分析次数</span>
              <span>
                {status.ai_usage_today.analyses_count} / {status.ai_usage_today.daily_limit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">累计成本</span>
              <span className="font-mono">${status.ai_usage_today.total_cost_usd}</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-gray-800 rounded-full h-2 mt-2">
              <div
                className="bg-purple-500 h-2 rounded-full"
                style={{
                  width: `${Math.min(100, (status.ai_usage_today.analyses_count / status.ai_usage_today.daily_limit) * 100)}%`,
                }}
              />
            </div>
          </div>
        </Card>

        {/* Data Sources */}
        <Card title="数据源">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Binance API Key</span>
              <StatusDot ok={config.data_sources.has_binance_key} />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">CryptoPanic Key</span>
              <StatusDot ok={config.data_sources.has_cryptopanic_key} />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">CoinGecko</span>
              <span className="text-green-400 text-xs">免费</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">DexScreener</span>
              <span className="text-green-400 text-xs">免费</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">DefiLlama</span>
              <span className="text-green-400 text-xs">免费</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">RSS Feeds</span>
              <span className="text-green-400 text-xs">免费</span>
            </div>
          </div>
        </Card>

        {/* Schedule */}
        <Card title="采集调度">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">市场数据间隔</span>
              <span>{config.schedule.collect_interval_minutes} 分钟</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">新闻采集间隔</span>
              <span>{config.schedule.news_collect_interval_minutes} 分钟</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">AI 分析间隔</span>
              <span>{config.schedule.analysis_interval_hours} 小时</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Data Stats */}
      <Card title="数据统计">
        <div className="grid grid-cols-5 gap-4 text-center">
          {[
            { label: "K 线数据", count: status.data_counts.ohlcv, last: status.last_collection.ohlcv },
            { label: "DEX 数据", count: status.data_counts.dex_pairs, last: status.last_collection.dex },
            { label: "DeFi 数据", count: status.data_counts.defi_protocols, last: status.last_collection.defi },
            { label: "新闻", count: status.data_counts.news_articles, last: status.last_collection.news },
            { label: "分析报告", count: status.data_counts.analysis_reports, last: status.last_collection.analysis },
          ].map((item) => (
            <div key={item.label} className="bg-gray-800 rounded p-3">
              <p className="text-2xl font-bold">{item.count.toLocaleString()}</p>
              <p className="text-xs text-gray-400">{item.label}</p>
              <p className="text-xs text-gray-500 mt-1">
                {item.last ? new Date(item.last).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "-"}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">数据库大小: {status.database_size}</p>
      </Card>

      {/* Scheduler Jobs */}
      {scheduler && (
        <Card title="调度任务">
          <div className="space-y-2 text-sm">
            {scheduler.jobs?.map((job: any) => (
              <div key={job.id} className="flex justify-between">
                <span className="text-gray-400">{job.name}</span>
                <span className="text-xs text-gray-500">
                  下次: {job.next_run ? new Date(job.next_run).toLocaleString("zh-CN") : "-"}
                </span>
              </div>
            ))}
            {(!scheduler.jobs || scheduler.jobs.length === 0) && (
              <p className="text-gray-500">无调度任务</p>
            )}
          </div>
        </Card>
      )}

      <p className="text-xs text-gray-600 text-center">
        配置修改请编辑 .env 文件后重启服务
      </p>
    </div>
  );
}

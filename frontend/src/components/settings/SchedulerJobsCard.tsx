"use client";

import { useEffect, useState, useRef } from "react";
import Card from "@/components/ui/Card";
import { StatusDot } from "./shared";
import { useLanguage } from "@/components/LanguageProvider";
import type { SchedulerStatus } from "@/lib/api";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

const jobDescriptions: Record<string, { zh: string; en: string }> = {
  collect_cex: {
    zh: "从 Binance 采集现货 K 线和 ticker 数据，存入 ohlcv_data 表",
    en: "Collects spot K-line and ticker data from Binance into ohlcv_data table",
  },
  collect_coingecko: {
    zh: "从 CoinGecko 获取市值排名前 N 的币种概览（价格、市值、24h 涨跌），并触发价格变动告警检查",
    en: "Fetches top-N coin overview from CoinGecko (price, market cap, 24h change) and triggers price alert checks",
  },
  collect_dexscreener: {
    zh: "从 DexScreener 采集 DEX 交易对数据（交易量、流动性等），存入 dex_volume 表",
    en: "Collects DEX trading pair data (volume, liquidity) from DexScreener into dex_volume table",
  },
  collect_defillama: {
    zh: "从 DefiLlama 采集 DeFi 协议 TVL 数据，存入 defi_metric 表",
    en: "Collects DeFi protocol TVL data from DefiLlama into defi_metric table",
  },
  collect_futures: {
    zh: "从 Binance 合约市场采集资金费率、持仓量、多空比等衍生品数据，存入 futures_metric 表",
    en: "Collects funding rate, open interest, long/short ratio from Binance Futures into futures_metric table",
  },
  collect_fear_greed: {
    zh: "从 alternative.me 获取加密货币恐惧贪婪指数",
    en: "Fetches Crypto Fear & Greed Index from alternative.me",
  },
  collect_news: {
    zh: "从加密货币 RSS 源采集新闻文章，存入 news_article 表",
    en: "Collects crypto news articles from RSS feeds into news_article table",
  },
  collect_newsapi: {
    zh: "从 NewsAPI.org 采集主流媒体新闻（免费版限 100 次/天），需在 .env 中启用 NEWSAPI_ENABLED=true",
    en: "Collects mainstream media news from NewsAPI.org (free tier: 100 req/day). Requires NEWSAPI_ENABLED=true in .env",
  },
  ai_analysis: {
    zh: "运行 AI 市场分析引擎，为市场全局及配置的币种生成分析报告（含情绪评分、趋势判断、风险等级），高风险或极端情绪触发告警",
    en: "Runs AI market analysis engine, generating reports for market overview and configured symbols (sentiment score, trend, risk level). High risk or extreme sentiment triggers alerts",
  },
  score_accuracy: {
    zh: "评估已成熟的 AI 推荐和新闻分析的准确率，对比预测与实际走势，更新 accuracy 字段",
    en: "Evaluates accuracy of matured AI recommendations and news analyses by comparing predictions against actual outcomes",
  },
  news_sentiment: {
    zh: "对未标注的新闻文章进行 AI 情绪标注（batch 处理），标注正面/负面/中性",
    en: "AI sentiment tagging for untagged news articles (batch processing) — positive/negative/neutral",
  },
  news_analyzer: {
    zh: "对新闻文章进行结构化 AI 分析（Pydantic 约束输出），提取关键事件、影响评估、关联币种，支持积压追赶",
    en: "Structured per-article AI analysis with Pydantic-constrained output, extracting key events, impact assessment, and related tokens. Supports backlog catch-up",
  },
  aggregate_fine_klines: {
    zh: "将 1 分钟 K 线聚合为 5 分钟和 15 分钟级别，写入同一 ohlcv_data 表",
    en: "Aggregates 1-minute candles into 5-minute and 15-minute timeframes, writing to ohlcv_data table",
  },
  data_retention: {
    zh: "清理过期数据：1 分钟 K 线保留 14 天，其他数据保留 90 天（可通过 DATA_RETENTION_DAYS 配置）",
    en: "Purges old data: 1m K-lines retained for 14 days, other data for 90 days (configurable via DATA_RETENTION_DAYS)",
  },
};

export default function SchedulerJobsCard({ scheduler }: { scheduler: SchedulerStatus }) {
  const { t, locale } = useLanguage();
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  return (
    <Card title={t("settings.schedulerJobs")}>
      <div className="space-y-2 text-sm">
        <div
          className="flex items-center gap-2 pb-1"
          style={{ borderBottom: "1px solid var(--border-primary)" }}
        >
          <StatusDot ok={scheduler.running} />
          <span className="text-xs text-[var(--text-muted)]">
            {scheduler.running ? t("settings.schedulerRunning") : t("settings.schedulerStopped")}
          </span>
        </div>
        {scheduler.jobs?.map((job) => {
          const desc = jobDescriptions[job.id];
          const tooltip = desc ? desc[locale] : job.name;
          return (
            <div key={job.id} className="flex justify-between" title={tooltip}>
              <span className="text-[var(--text-muted)]">{job.name}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {t("settings.nextRun")}:{" "}
                {job.next_run
                  ? formatCountdown(new Date(job.next_run).getTime() - now)
                  : "-"}
              </span>
            </div>
          );
        })}
        {(!scheduler.jobs || scheduler.jobs.length === 0) && (
          <p className="text-[var(--text-muted)]">{t("settings.noJobs")}</p>
        )}
      </div>
    </Card>
  );
}

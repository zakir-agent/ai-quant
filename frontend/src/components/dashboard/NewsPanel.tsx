"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getLatestNews,
  type NewsAnalysisBrief,
  type NewsItem,
  type NewsSourceGroup,
} from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import SegmentedControl from "@/components/ui/SegmentedControl";

const PER_TAB_LIMIT = 30;

function SentimentDot({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  const colorMap: Record<string, string> = {
    positive: "var(--success)",
    negative: "var(--danger)",
    neutral: "var(--warning)",
  };
  return (
    <span
      className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full"
      style={{ backgroundColor: colorMap[sentiment] || "var(--text-muted)" }}
    />
  );
}

function DirectionChip({
  direction,
  t,
}: {
  direction: -1 | 0 | 1;
  t: (key: string) => string;
}) {
  const config = {
    1: { label: t("news.bullish"), color: "var(--success)", arrow: "↑" },
    "-1": { label: t("news.bearish"), color: "var(--danger)", arrow: "↓" },
    0: { label: t("news.neutralDir"), color: "var(--text-muted)", arrow: "—" },
  };
  const c = config[String(direction) as keyof typeof config];
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${c.color} 15%, transparent)`, color: c.color }}
    >
      {c.arrow} {c.label}
    </span>
  );
}

function EventChip({ eventType, t }: { eventType: string; t: (key: string) => string }) {
  const label = t(`news.event_${eventType}`);
  return (
    <span className="inline-flex items-center rounded bg-[var(--bg-card-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
      {label}
    </span>
  );
}

function HorizonChip({ horizon, t }: { horizon: string; t: (key: string) => string }) {
  const label = t(`news.horizon_${horizon}`);
  return (
    <span className="inline-flex items-center rounded bg-[var(--bg-card-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
      {label}
    </span>
  );
}

function IntensityBar({ intensity, t }: { intensity: number; t: (key: string) => string }) {
  const color = intensity >= 70 ? "var(--danger)" : intensity >= 40 ? "var(--warning)" : "var(--success)";
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
      title={`${t("news.intensityLabel")}: ${intensity}`}
    >
      <span className="inline-block h-1 w-6 overflow-hidden rounded-full bg-[var(--bg-card-hover)]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${intensity}%`, backgroundColor: color }}
        />
      </span>
      {intensity}
    </span>
  );
}

function AnalysisBadges({ analysis, t }: { analysis: NewsAnalysisBrief; t: (key: string) => string }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      <DirectionChip direction={analysis.direction} t={t} />
      <EventChip eventType={analysis.event_type} t={t} />
      <HorizonChip horizon={analysis.time_horizon} t={t} />
      <IntensityBar intensity={analysis.intensity} t={t} />
    </div>
  );
}

function useTimeAgo() {
  const t = useT();

  return (dateStr: string): string => {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return t("common.justNow");
    if (diff < 3600) return t("common.minutesAgo").replace("{n}", String(Math.floor(diff / 60)));
    if (diff < 86400) return t("common.hoursAgo").replace("{n}", String(Math.floor(diff / 3600)));
    return t("common.daysAgo").replace("{n}", String(Math.floor(diff / 86400)));
  };
}

export default function NewsPanel({ articles }: { articles: NewsItem[] }) {
  const t = useT();
  const timeAgo = useTimeAgo();
  const [activeTab, setActiveTab] = useState<NewsSourceGroup>("all");
  // Per-group cache so flipping tabs doesn't refetch each time.
  const [groupArticles, setGroupArticles] = useState<Partial<Record<NewsSourceGroup, NewsItem[]>>>(
    {},
  );
  const [loading, setLoading] = useState(false);

  const tabOptions = useMemo(
    () => [
      { value: "all" as NewsSourceGroup, label: t("news.tabAll") },
      { value: "coingecko" as NewsSourceGroup, label: t("news.tabCoinGecko") },
      { value: "rss" as NewsSourceGroup, label: t("news.tabRss") },
      { value: "newsapi" as NewsSourceGroup, label: t("news.tabNewsapi") },
    ],
    [t],
  );

  // Fetch per-group when entering a non-"all" tab; "all" reuses what the
  // parent already loaded on initial dashboard mount.
  useEffect(() => {
    if (activeTab === "all") return;
    if (groupArticles[activeTab]) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const d = await getLatestNews(PER_TAB_LIMIT, activeTab);
        if (cancelled) return;
        setGroupArticles((prev) => ({ ...prev, [activeTab]: d.articles }));
      } catch {
        if (cancelled) return;
        setGroupArticles((prev) => ({ ...prev, [activeTab]: [] }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, groupArticles]);

  const visible: NewsItem[] = activeTab === "all" ? articles : (groupArticles[activeTab] ?? []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SegmentedControl
        options={tabOptions}
        value={activeTab}
        onChange={setActiveTab}
        className="self-start"
      />
      {loading && activeTab !== "all" && groupArticles[activeTab] === undefined ? (
        <p className="py-8 text-center text-[var(--text-muted)]">{t("common.loading")}</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-[var(--text-muted)]">{t("common.noData")}</p>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto pr-2">
          {visible.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded bg-[var(--bg-secondary)] p-3 transition-colors hover:bg-[var(--bg-card-hover)]"
            >
              <div className="flex items-start gap-2">
                <SentimentDot sentiment={a.sentiment} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-[var(--text-primary)]">
                    {a.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{a.source}</span>
                    <span>{timeAgo(a.published_at)}</span>
                  </div>
                  {a.analysis && <AnalysisBadges analysis={a.analysis} t={t} />}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

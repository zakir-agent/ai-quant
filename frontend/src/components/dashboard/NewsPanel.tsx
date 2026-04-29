"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getLatestNews,
  getNewsSignals,
  type NewsAnalysisBrief,
  type NewsItem,
  type NewsSignal,
  type NewsSourceGroup,
} from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import SegmentedControl from "@/components/ui/SegmentedControl";

const PER_TAB_LIMIT = 30;

/* ── Signal Bar ── */

function SignalCard({ signal, t }: { signal: NewsSignal; t: (key: string) => string }) {
  const dirConfig = {
    1: { arrow: "▲", color: "var(--success)", label: t("news.bullish") },
    "-1": { arrow: "▼", color: "var(--danger)", label: t("news.bearish") },
    0: { arrow: "—", color: "var(--text-muted)", label: t("news.neutralDir") },
  };
  const d = dirConfig[String(signal.direction) as keyof typeof dirConfig];
  return (
    <Link
      href={`/news?asset=${signal.asset}`}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2.5 py-1.5 transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-card-hover)]"
    >
      <span className="text-xs font-semibold text-[var(--text-primary)]">{signal.asset}</span>
      <span className="text-[10px]" style={{ color: d.color }}>
        {d.arrow}
      </span>
      <span
        className="rounded px-1 py-0.5 text-[10px] font-medium"
        style={{
          backgroundColor: `color-mix(in srgb, ${d.color} 15%, transparent)`,
          color: d.color,
        }}
      >
        {Math.abs(signal.weighted_score).toFixed(0)}
      </span>
    </Link>
  );
}

function SignalBar({ t }: { t: (key: string) => string }) {
  const [signals, setSignals] = useState<NewsSignal[]>([]);

  useEffect(() => {
    let cancelled = false;
    getNewsSignals(24)
      .then((d) => {
        if (!cancelled) setSignals(d.signals);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (signals.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.slice(0, 5).map((s) => (
        <SignalCard key={s.asset} signal={s} t={t} />
      ))}
    </div>
  );
}

/* ── Direction Chip (compact) ── */

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
      style={{
        backgroundColor: `color-mix(in srgb, ${c.color} 15%, transparent)`,
        color: c.color,
      }}
    >
      {c.arrow} {c.label}
    </span>
  );
}

/* ── Event Chip ── */

function EventChip({ eventType, t }: { eventType: string; t: (key: string) => string }) {
  const label = t(`news.event_${eventType}`);
  return (
    <span className="inline-flex items-center rounded bg-[var(--bg-card-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
      {label}
    </span>
  );
}

/* ── Analysis Badges (compact) ── */

function AnalysisBadges({ analysis, t }: { analysis: NewsAnalysisBrief; t: (key: string) => string }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <DirectionChip direction={analysis.direction} t={t} />
      <EventChip eventType={analysis.event_type} t={t} />
      {analysis.summary_zh && (
        <span className="ml-1 truncate text-[10px] text-[var(--text-muted)]">
          {analysis.summary_zh}
        </span>
      )}
    </div>
  );
}

/* ── Time ago hook ── */

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

/* ── Main Panel ── */

export default function NewsPanel({ articles }: { articles: NewsItem[] }) {
  const t = useT();
  const timeAgo = useTimeAgo();
  const [activeTab, setActiveTab] = useState<NewsSourceGroup>("all");
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
      {/* Signal Bar */}
      <SignalBar t={t} />

      {/* Tabs + View All */}
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl
          options={tabOptions}
          value={activeTab}
          onChange={setActiveTab}
          className="self-start"
        />
        <Link
          href="/news"
          className="shrink-0 text-[10px] text-[var(--accent-primary)] hover:underline"
        >
          {t("news.viewAll")} →
        </Link>
      </div>

      {/* News List */}
      {loading && activeTab !== "all" && groupArticles[activeTab] === undefined ? (
        <p className="py-8 text-center text-[var(--text-muted)]">{t("common.loading")}</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-[var(--text-muted)]">{t("common.noData")}</p>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto pr-2">
          {visible.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded bg-[var(--bg-secondary)] p-2.5 transition-colors hover:bg-[var(--bg-card-hover)]"
            >
              <p className="line-clamp-2 text-sm font-medium text-[var(--text-primary)]">
                {a.title}
              </p>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <span>{a.source}</span>
                <span>·</span>
                <span>{timeAgo(a.published_at)}</span>
              </div>
              {a.analysis && <AnalysisBadges analysis={a.analysis} t={t} />}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

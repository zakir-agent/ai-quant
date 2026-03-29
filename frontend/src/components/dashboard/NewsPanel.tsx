"use client";

import type { NewsItem } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

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

  if (!articles.length) {
    return <p className="py-8 text-center text-[var(--text-muted)]">{t("common.noData")}</p>;
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto pr-2">
      {articles.map((a) => (
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
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

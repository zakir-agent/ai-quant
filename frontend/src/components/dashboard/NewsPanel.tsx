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
      className="inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
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
    if (diff < 3600)
      return t("common.minutesAgo").replace("{n}", String(Math.floor(diff / 60)));
    if (diff < 86400)
      return t("common.hoursAgo").replace("{n}", String(Math.floor(diff / 3600)));
    return t("common.daysAgo").replace("{n}", String(Math.floor(diff / 86400)));
  };
}

export default function NewsPanel({ articles }: { articles: NewsItem[] }) {
  const t = useT();
  const timeAgo = useTimeAgo();

  if (!articles.length) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        {t("common.noData")}
      </p>
    );
  }

  return (
    <div className="space-y-3 flex-1 overflow-y-auto pr-2">
      {articles.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded p-3 transition-colors bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)]"
        >
          <div className="flex items-start gap-2">
            <SentimentDot sentiment={a.sentiment} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">
                {a.title}
              </p>
              <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-muted)]">
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

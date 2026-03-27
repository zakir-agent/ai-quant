"use client";

import type { NewsItem } from "@/lib/api";

function SentimentDot({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  const colors: Record<string, string> = {
    positive: "bg-green-400",
    negative: "bg-red-400",
    neutral: "bg-yellow-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[sentiment] || "bg-gray-400"}`} />;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

export default function NewsPanel({ articles }: { articles: NewsItem[] }) {
  if (!articles.length) {
    return <p className="text-gray-500 text-center py-8">暂无新闻，请点击采集</p>;
  }

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
      {articles.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-gray-800/50 hover:bg-gray-800 rounded p-3 transition-colors"
        >
          <div className="flex items-start gap-2">
            <SentimentDot sentiment={a.sentiment} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 line-clamp-2">{a.title}</p>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
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

"use client";

import { useT } from "@/components/LanguageProvider";
import Badge from "@/components/ui/Badge";
import type { NewsArticleBrief } from "@/lib/api";

interface Props {
  news: NewsArticleBrief[];
  onClick?: () => void;
}

function directionBadge(dir: number) {
  if (dir > 0) return <Badge variant="success">{"↑"}</Badge>;
  if (dir < 0) return <Badge variant="danger">{"↓"}</Badge>;
  return <Badge variant="warning">{"→"}</Badge>;
}

export default function NewsInsightCard({ news, onClick }: Props) {
  const t = useT();

  return (
    <div
      className="col-span-3 cursor-pointer rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4 transition-all hover:-translate-y-0.5 hover:border-white/12"
      onClick={onClick}
    >
      <p className="mb-3 text-xs text-neutral-500">{t("analysis.newsInsight")}</p>
      {news.length === 0 ? (
        <p className="text-xs text-neutral-500">{t("analysis.noData")}</p>
      ) : (
        <div className="space-y-2">
          {news.slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-white/3 px-3 py-2">
              {directionBadge(item.analysis?.direction ?? 0)}
              <span className="flex-1 truncate text-sm">{item.title}</span>
              {item.analysis?.primary_asset && (
                <span className="text-xs text-neutral-500">{item.analysis.primary_asset}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

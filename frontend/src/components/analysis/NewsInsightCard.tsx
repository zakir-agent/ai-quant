"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import { useT } from "@/components/LanguageProvider";
import Badge from "@/components/ui/Badge";
import type { NewsArticleBrief } from "@/lib/api";

interface Props {
  news: NewsArticleBrief[];
}

function directionBadge(dir: number) {
  if (dir > 0) return <Badge variant="success">{"↑"}</Badge>;
  if (dir < 0) return <Badge variant="danger">{"↓"}</Badge>;
  return <Badge variant="warning">{"→"}</Badge>;
}

function newsLink(item: NewsArticleBrief): string {
  const params = new URLSearchParams();
  const asset = item.analysis?.primary_asset;
  if (asset) params.set("asset", asset);
  params.set("id", String(item.id));
  return `/news?${params.toString()}`;
}

export default function NewsInsightCard({ news }: Props) {
  const t = useT();

  return (
    <Card title={t("analysis.newsInsight")} className="col-span-full">
      {news.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{t("analysis.noData")}</p>
      ) : (
        <div className="space-y-2">
          {news.slice(0, 3).map((item, i) => (
            <Link
              key={i}
              href={newsLink(item)}
              className="flex items-center gap-2 rounded-md bg-[var(--bg-card-hover)] px-3 py-2 transition-colors hover:bg-[var(--bg-secondary)]"
            >
              {directionBadge(item.analysis?.direction ?? 0)}
              <span className="flex-1 truncate text-sm">{item.title}</span>
              {item.analysis?.primary_asset && (
                <span className="text-xs text-[var(--text-muted)]">
                  {item.analysis.primary_asset}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

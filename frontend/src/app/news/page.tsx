"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  getLatestNews,
  getNewsAnalysis,
  getNewsSignals,
  type NewsItem,
  type NewsSignal,
  type NewsSourceGroup,
} from "@/lib/api";
import Badge from "@/components/ui/Badge";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useT } from "@/components/LanguageProvider";

const PAGE_LIMIT = 10;

/* ── Helpers ── */

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

function directionColor(d: -1 | 0 | 1): string {
  if (d === 1) return "var(--success)";
  if (d === -1) return "var(--danger)";
  return "var(--text-muted)";
}

/* ── Signal Chips (top bar) ── */

function SignalChips({
  signals,
  activeAsset,
  onSelect,
}: {
  signals: NewsSignal[];
  activeAsset: string | null;
  onSelect: (asset: string | null) => void;
}) {
  if (signals.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {signals.map((s) => {
        const active = activeAsset === s.asset;
        const d = directionColor(s.direction);
        const arrow = s.direction === 1 ? "▲" : s.direction === -1 ? "▼" : "—";
        return (
          <button
            key={s.asset}
            onClick={() => onSelect(active ? null : s.asset)}
            className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              borderColor: active ? d : "var(--border-primary)",
              backgroundColor: active
                ? `color-mix(in srgb, ${d} 12%, transparent)`
                : "var(--bg-secondary)",
              color: active ? d : "var(--text-secondary)",
            }}
          >
            {s.asset} {arrow} {Math.abs(s.weighted_score).toFixed(0)}
          </button>
        );
      })}
    </div>
  );
}

/* ── News List Item ── */

function NewsListItem({
  article,
  selected,
  onClick,
  t,
}: {
  article: NewsItem;
  selected: boolean;
  onClick: () => void;
  t: (key: string) => string;
}) {
  const timeAgo = useTimeAgo();
  const a = article.analysis;
  return (
    <button
      onClick={onClick}
      className="w-full cursor-pointer rounded-lg border p-3 text-left transition-colors"
      style={{
        borderColor: selected ? "var(--accent-primary)" : "var(--border-primary)",
        backgroundColor: selected
          ? "color-mix(in srgb, var(--accent-primary) 8%, var(--bg-card))"
          : "var(--bg-secondary)",
      }}
    >
      <p className="line-clamp-2 text-sm font-medium text-[var(--text-primary)]">
        {article.title}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {a && (
          <>
            <Badge
              variant={a.direction === 1 ? "success" : a.direction === -1 ? "danger" : "default"}
            >
              {a.direction === 1 ? "↑" : a.direction === -1 ? "↓" : "—"}{" "}
              {t(`news.${a.direction === 1 ? "bullish" : a.direction === -1 ? "bearish" : "neutralDir"}`)}
            </Badge>
            <span className="rounded bg-[var(--bg-card-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
              {t(`news.event_${a.event_type}`)}
            </span>
            <span className="rounded bg-[var(--bg-card-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
              {t(`news.horizon_${a.time_horizon}`)}
            </span>
            {a.intensity > 0 && (
              <span className="text-[10px] text-[var(--text-muted)]">
                {t("news.intensityLabel")} {a.intensity}
              </span>
            )}
          </>
        )}
      </div>
      {a?.summary_zh && (
        <p className="mt-1.5 line-clamp-1 text-[11px] text-[var(--text-muted)]">{a.summary_zh}</p>
      )}
      <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
        <span>{article.source}</span>
        <span>·</span>
        <span>{timeAgo(article.published_at)}</span>
      </div>
    </button>
  );
}

/* ── Detail Panel ── */

interface AnalysisDetail {
  id: number;
  status: string;
  is_actionable: boolean | null;
  primary_asset: string | null;
  assets: Array<{ code: string; role: string }> | null;
  direction: -1 | 0 | 1;
  magnitude: number;
  confidence: number;
  confidence_reason: string | null;
  event_type: string;
  time_horizon: string;
  intensity: number;
  relevance_score: number;
  tags: string[] | null;
  raw_quote: string | null;
  summary_zh: string | null;
  model_used: string;
  created_at: string;
}

function DetailPanel({ article, t }: { article: NewsItem | null; t: (key: string) => string }) {
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const currentIdRef = useRef<number | null>(null);
  // Incremented each time a new fetch starts; detail only applies when it matches
  const [fetchedId, setFetchedId] = useState<number | null>(null);

  useEffect(() => {
    if (!article?.id) return;
    currentIdRef.current = article.id;
    let cancelled = false;
    getNewsAnalysis(article.id)
      .then((d) => {
        if (!cancelled && currentIdRef.current === article.id) {
          setDetail(d.analysis as AnalysisDetail | null);
          setFetchedId(article.id);
        }
      })
      .catch(() => {
        if (!cancelled && currentIdRef.current === article.id) {
          setDetail(null);
          setFetchedId(article.id);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [article?.id]);

  const loadingDetail = article?.id != null && fetchedId !== article.id;

  if (!article) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">{t("news.selectNewsHint")}</p>
      </div>
    );
  }

  const a = article.analysis;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      {/* Title */}
      <div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-[var(--text-primary)] hover:underline"
        >
          {article.title}
        </a>
        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>{article.source}</span>
          <span>·</span>
          <span>{new Date(article.published_at).toLocaleString()}</span>
        </div>
      </div>

      {/* Brief from list (always available) */}
      {a && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-[var(--text-muted)]">
            {t("news.detail")}
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <DetailRow label={t("news.bullish").split("")[0] === "看" ? "方向" : "Direction"}>
              <Badge
                variant={a.direction === 1 ? "success" : a.direction === -1 ? "danger" : "default"}
              >
                {a.direction === 1 ? "↑ " : a.direction === -1 ? "↓ " : "— "}
                {t(`news.${a.direction === 1 ? "bullish" : a.direction === -1 ? "bearish" : "neutralDir"}`)}
              </Badge>
            </DetailRow>
            <DetailRow label={t("news.magnitude")}>
              <span className="text-sm text-[var(--text-primary)]">{a.intensity}/100</span>
            </DetailRow>
            <DetailRow label={t("analysis.time")}>
              <span className="text-xs text-[var(--text-secondary)]">
                {t(`news.horizon_${a.time_horizon}`)}
              </span>
            </DetailRow>
            <DetailRow label={t("news.confidence")}>
              {a.confidence != null ? (
                <span className="text-sm text-[var(--text-primary)]">
                  {(a.confidence * 100).toFixed(0)}%
                </span>
              ) : (
                <span className="text-xs text-[var(--text-muted)]">—</span>
              )}
            </DetailRow>
          </div>
        </div>
      )}

      {/* Full detail from API */}
      {loadingDetail && (
        <p className="text-xs text-[var(--text-muted)]">{t("common.loading")}</p>
      )}
      {detail && (
        <div className="space-y-3">
          {/* Summary */}
          {detail.summary_zh && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">
                {t("news.summaryZh")}
              </h4>
              <p className="text-sm text-[var(--text-primary)]">{detail.summary_zh}</p>
            </div>
          )}

          {/* Confidence reason */}
          {detail.confidence_reason && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">
                {t("news.confidence")} {t("news.detail")}
              </h4>
              <p className="text-xs text-[var(--text-secondary)]">{detail.confidence_reason}</p>
            </div>
          )}

          {/* Raw quote */}
          {detail.raw_quote && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">
                {t("news.quote")}
              </h4>
              <blockquote className="border-l-2 border-[var(--accent-primary)] pl-3 text-xs italic text-[var(--text-secondary)]">
                {detail.raw_quote}
              </blockquote>
            </div>
          )}

          {/* Assets */}
          {detail.assets && detail.assets.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">
                {t("news.asset")}
              </h4>
              <div className="flex flex-wrap gap-1">
                {detail.assets.map((asset) => (
                  <span
                    key={asset.code}
                    className="rounded bg-[var(--bg-card-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                  >
                    {asset.code}
                    {asset.role === "primary" && " ★"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {detail.tags && detail.tags.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">Tags</h4>
              <div className="flex flex-wrap gap-1">
                {detail.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[var(--bg-card-hover)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actionable */}
          {detail.is_actionable != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Actionable:</span>
              <Badge variant={detail.is_actionable ? "success" : "default"}>
                {detail.is_actionable ? "Yes" : "No"}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  );
}

/* ── Page ── */

function NewsPageInner() {
  const t = useT();
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialAsset = searchParams.get("asset");
  const initialSource = searchParams.get("source") as NewsSourceGroup | null;

  const [activeTab, setActiveTab] = useState<NewsSourceGroup>(initialSource ?? "all");
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [signals, setSignals] = useState<NewsSignal[]>([]);
  const [activeAsset, setActiveAsset] = useState<string | null>(initialAsset);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  // Load signals on mount
  useEffect(() => {
    getNewsSignals(24)
      .then((d) => setSignals(d.signals))
      .catch(() => {});
  }, []);

  // Load articles when tab or page changes
  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_LIMIT;
      const d = await getLatestNews(PAGE_LIMIT, activeTab, offset);
      setArticles(d.articles);
      setTotal(d.total);
    } catch {
      setArticles([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  // Filter by asset if selected
  const filtered = useMemo(() => {
    if (!activeAsset) return articles;
    return articles.filter(
      (a) =>
        a.analysis?.primary_asset?.toUpperCase() === activeAsset.toUpperCase() ||
        a.title.toUpperCase().includes(activeAsset),
    );
  }, [articles, activeAsset]);

  const selectedArticle = useMemo(
    () => filtered.find((a) => a.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  const tabOptions = useMemo(
    () => [
      { value: "all" as NewsSourceGroup, label: t("news.tabAll") },
      { value: "coingecko" as NewsSourceGroup, label: t("news.tabCoinGecko") },
      { value: "rss" as NewsSourceGroup, label: t("news.tabRss") },
      { value: "newsapi" as NewsSourceGroup, label: t("news.tabNewsapi") },
    ],
    [t],
  );

  const handleAssetSelect = useCallback(
    (asset: string | null) => {
      setActiveAsset(asset);
      setSelectedId(null);
      // Update URL without reload
      const params = new URLSearchParams(searchParams.toString());
      if (asset) {
        params.set("asset", asset);
      } else {
        params.delete("asset");
      }
      router.replace(`/news?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4"
    >
      {/* Signal chips */}
      <SignalChips
        signals={signals}
        activeAsset={activeAsset}
        onSelect={handleAssetSelect}
      />

      {/* Main content: master-detail */}
      <div className="flex min-h-[600px] flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-[var(--card-shadow)] lg:flex-row">
        {/* Left: News list */}
        <div className="flex w-full flex-col border-b border-[var(--border-primary)] p-4 lg:w-[60%] lg:border-b-0 lg:border-r">
          {/* Tabs + count */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <SegmentedControl
              options={tabOptions}
              value={activeTab}
              onChange={(v) => {
                setActiveTab(v);
                setSelectedId(null);
                setPage(1);
              }}
            />
            <span className="shrink-0 text-xs text-[var(--text-muted)]">
              {t("news.newsCount").replace("{n}", String(filtered.length))}
            </span>
          </div>

          {/* List */}
          {loading ? (
            <p className="py-12 text-center text-sm text-[var(--text-muted)]">{t("common.loading")}</p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--text-muted)]">{t("common.noData")}</p>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {filtered.map((a) => (
                  <NewsListItem
                    key={a.id}
                    article={a}
                    selected={a.id === selectedId}
                    onClick={() => setSelectedId(a.id)}
                    t={t}
                  />
                ))}
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex shrink-0 items-center justify-center gap-2 border-t border-[var(--border-primary)] pt-3">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="cursor-pointer rounded border border-[var(--border-primary)] px-3 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("common.prev")}
                  </button>
                  <span className="text-xs text-[var(--text-muted)]">
                    {page} / {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="cursor-pointer rounded border border-[var(--border-primary)] px-3 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("common.next")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Detail */}
        <div className="flex w-full flex-col p-4 lg:w-[40%]">
          <DetailPanel article={selectedArticle} t={t} />
        </div>
      </div>
    </motion.div>
  );
}

export default function NewsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading...</div>}>
      <NewsPageInner />
    </Suspense>
  );
}

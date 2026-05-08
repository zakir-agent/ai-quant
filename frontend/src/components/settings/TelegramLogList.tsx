"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getTelegramLogs, type TelegramLogItem, type TelegramLogPage } from "@/lib/api";
import { useLanguage } from "@/components/LanguageProvider";

const PAGE_SIZE = 10;

type StatusFilter = "all" | "sent" | "failed";

function StatusBadge({ status }: { status: TelegramLogItem["status"] }) {
  const { t } = useLanguage();
  const ok = status === "sent";
  const color = ok ? "var(--success)" : "var(--danger)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        color,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {ok ? t("settings.tgStatusSent") : t("settings.tgStatusFailed")}
    </span>
  );
}

export default function TelegramLogList() {
  const { t, locale } = useLanguage();
  const dateLocale = locale === "zh" ? "zh-CN" : "en-US";
  const [items, setItems] = useState<TelegramLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (nextOffset: number, filter: StatusFilter, append: boolean) => {
      setLoading(true);
      setError(false);
      try {
        const data: TelegramLogPage = await getTelegramLogs({
          limit: PAGE_SIZE,
          offset: nextOffset,
          status: filter === "all" ? undefined : filter,
        });
        setTotal(data.total);
        if (append) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setOffset(nextOffset + data.items.length);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setOffset(0);
    setExpanded(null);
    void load(0, statusFilter, false);
  }, [statusFilter, load]);

  const hasMore = items.length < total;

  const loadNextPage = useCallback(() => {
    if (loading || !hasMore) return;
    void load(offset, statusFilter, true);
  }, [hasMore, load, loading, offset, statusFilter]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadNextPage();
        }
      },
      { rootMargin: "120px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadNextPage]);

  const changeFilter = (next: StatusFilter) => {
    setStatusFilter(next);
  };

  const filterButton = (key: StatusFilter, label: string) => {
    const active = statusFilter === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => changeFilter(key)}
        className="rounded px-2 py-1 text-xs font-medium transition"
        style={{
          backgroundColor: active ? "var(--accent-primary)" : "var(--bg-secondary)",
          color: active ? "var(--text-primary)" : "var(--text-muted)",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {filterButton("all", t("settings.tgFilterAll"))}
          {filterButton("sent", t("settings.tgFilterSent"))}
          {filterButton("failed", t("settings.tgFilterFailed"))}
        </div>
        <button
          type="button"
          onClick={() => void load(0, statusFilter, false)}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          disabled={loading}
        >
          {loading ? t("common.loading") : t("common.refresh")}
        </button>
      </div>

      {error ? (
        <p className="rounded p-3 text-sm" style={{ color: "var(--danger)" }}>
          {t("common.loadFailed")}
        </p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          {loading ? t("common.loading") : t("common.noData")}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-primary)]">
          {items.map((item) => {
            const isOpen = expanded === item.id;
            return (
              <li key={item.id} className="py-2">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={item.status} />
                      <span className="font-mono text-xs text-[var(--text-muted)]">
                        {item.event_type}
                      </span>
                      <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {item.title}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
                      <span>{new Date(item.created_at).toLocaleString(dateLocale)}</span>
                      <span className="font-mono">
                        {t("settings.tgChat")}: {item.chat_id_masked || "-"}
                      </span>
                      {item.telegram_message_id !== null && (
                        <span className="font-mono">
                          {t("settings.tgMessageId")}: {item.telegram_message_id}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    {isOpen ? "▾" : "▸"}
                  </span>
                </button>
                {isOpen && (
                  <div
                    className="mt-2 space-y-2 rounded-md p-3 text-xs"
                    style={{ backgroundColor: "var(--bg-secondary)" }}
                  >
                    <div>
                      <p className="mb-1 text-[var(--text-muted)]">{t("settings.tgBody")}</p>
                      <pre className="font-sans break-words whitespace-pre-wrap text-[var(--text-primary)]">
                        {item.message_body}
                      </pre>
                    </div>
                    {item.error_text && (
                      <div>
                        <p className="mb-1" style={{ color: "var(--danger)" }}>
                          {t("settings.tgError")}
                        </p>
                        <pre
                          className="font-sans break-words whitespace-pre-wrap"
                          style={{ color: "var(--danger)" }}
                        >
                          {item.error_text}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!error && items.length > 0 && (
        <div ref={loadMoreRef} className="flex justify-center py-2 text-xs text-[var(--text-muted)]">
          {loading ? t("common.loading") : hasMore ? "" : null}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>
          {t("settings.tgTotal")}: {total}
        </span>
        <span>{items.length}</span>
      </div>
    </div>
  );
}

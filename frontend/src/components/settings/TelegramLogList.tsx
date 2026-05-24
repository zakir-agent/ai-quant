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
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (nextOffset: number, status: StatusFilter, eventType: string, append: boolean) => {
      setLoading(true);
      setError(false);
      try {
        const data: TelegramLogPage = await getTelegramLogs({
          limit: PAGE_SIZE,
          offset: nextOffset,
          status: status === "all" ? undefined : status,
          eventType: eventType === "all" ? undefined : eventType,
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
    void load(0, statusFilter, eventTypeFilter, false);
  }, [statusFilter, eventTypeFilter, load]);

  const eventTypes = [...new Set(items.map((i) => i.event_type))];

  const hasMore = items.length < total;

  const loadNextPage = useCallback(() => {
    if (loading || !hasMore) return;
    void load(offset, statusFilter, eventTypeFilter, true);
  }, [hasMore, load, loading, offset, statusFilter, eventTypeFilter]);

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

  const eventFilterButton = (key: string, label: string) => {
    const active = eventTypeFilter === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setEventTypeFilter(key)}
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
          onClick={() => void load(0, statusFilter, eventTypeFilter, false)}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          disabled={loading}
        >
          {loading ? t("common.loading") : t("common.refresh")}
        </button>
      </div>

      {eventTypes.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {eventFilterButton("all", t("settings.tgFilterAll"))}
          {eventTypes.map((et) => eventFilterButton(et, et))}
        </div>
      )}

      {error ? (
        <p className="rounded p-3 text-sm" style={{ color: "var(--danger)" }}>
          {t("common.loadFailed")}
        </p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          {loading ? t("common.loading") : t("common.noData")}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-4 transition hover:border-[var(--accent-primary)]"
            >
              <div className="mb-2 flex items-center justify-between">
                <StatusBadge status={item.status} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {new Date(item.created_at).toLocaleString(dateLocale)}
                </span>
              </div>
              <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
              <pre className="mb-2 font-sans text-xs whitespace-pre-wrap text-[var(--text-secondary)]">
                {item.message_body}
              </pre>
              {item.error_text && (
                <p className="mb-2 text-xs" style={{ color: "var(--danger)" }}>
                  {item.error_text}
                </p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
                <span className="font-mono">{item.event_type}</span>
                <span>
                  {t("settings.tgChat")}: {item.chat_id_masked || "-"}
                </span>
                {item.telegram_message_id !== null && (
                  <span className="font-mono">
                    {t("settings.tgMessageId")}: {item.telegram_message_id}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!error && items.length > 0 && (
        <div
          ref={loadMoreRef}
          className="flex justify-center py-2 text-xs text-[var(--text-muted)]"
        >
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

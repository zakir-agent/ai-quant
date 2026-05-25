"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getTelegramLogs,
  getTelegramLogEventTypes,
  type TelegramLogItem,
  type TelegramLogPage,
} from "@/lib/api";
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
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void getTelegramLogEventTypes()
      .then((data) => setEventTypes(data.event_types))
      .catch(() => {});
  }, []);

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

  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const eventDropdownRef = useRef<HTMLDivElement | null>(null);

  const filteredEventTypes = eventTypes.filter((et) =>
    et.toLowerCase().includes(eventSearch.toLowerCase()),
  );

  useEffect(() => {
    if (!eventDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (eventDropdownRef.current && !eventDropdownRef.current.contains(e.target as Node)) {
        setEventDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [eventDropdownOpen]);

  const eventLabel = eventTypeFilter === "all" ? t("settings.tgFilterAll") : eventTypeFilter;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {filterButton("all", t("settings.tgFilterAll"))}
          {filterButton("sent", t("settings.tgFilterSent"))}
          {filterButton("failed", t("settings.tgFilterFailed"))}
        </div>

        {eventTypes.length > 0 && (
          <div ref={eventDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setEventDropdownOpen((v) => !v)}
              className="flex items-center gap-2 rounded border px-3 py-1.5 text-xs transition"
              style={{
                borderColor: "var(--border-primary)",
                backgroundColor: "var(--bg-secondary)",
                color: eventTypeFilter === "all" ? "var(--text-muted)" : "var(--text-primary)",
              }}
            >
              <span className="text-[var(--text-muted)]">类型:</span>
              <span className="max-w-[200px] truncate font-mono">{eventLabel}</span>
              <span className="text-[var(--text-muted)]">{eventDropdownOpen ? "▴" : "▾"}</span>
            </button>
            {eventDropdownOpen && (
              <div
                className="absolute z-50 mt-1 w-64 rounded-lg border shadow-lg"
                style={{
                  borderColor: "var(--border-primary)",
                  backgroundColor: "var(--bg-card)",
                }}
              >
                <div className="p-2">
                  <input
                    type="text"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    placeholder="搜索类型..."
                    className="w-full rounded border px-2 py-1 text-xs outline-none"
                    style={{
                      borderColor: "var(--border-primary)",
                      backgroundColor: "var(--bg-secondary)",
                      color: "var(--text-primary)",
                    }}
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEventTypeFilter("all");
                      setEventDropdownOpen(false);
                      setEventSearch("");
                    }}
                    className="w-full rounded px-2 py-1 text-left text-xs transition"
                    style={{
                      backgroundColor:
                        eventTypeFilter === "all" ? "var(--accent-primary)" : "transparent",
                      color:
                        eventTypeFilter === "all" ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {t("settings.tgFilterAll")}
                  </button>
                  {filteredEventTypes.map((et) => (
                    <button
                      key={et}
                      type="button"
                      onClick={() => {
                        setEventTypeFilter(et);
                        setEventDropdownOpen(false);
                        setEventSearch("");
                      }}
                      className="w-full truncate rounded px-2 py-1 text-left font-mono text-xs transition"
                      style={{
                        backgroundColor:
                          eventTypeFilter === et ? "var(--accent-primary)" : "transparent",
                        color: eventTypeFilter === et ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      {et}
                    </button>
                  ))}
                  {filteredEventTypes.length === 0 && (
                    <p className="px-2 py-1 text-xs text-[var(--text-muted)]">无匹配结果</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => void load(0, statusFilter, eventTypeFilter, false)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            disabled={loading}
          >
            {loading ? t("common.loading") : t("common.refresh")}
          </button>
        </div>
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

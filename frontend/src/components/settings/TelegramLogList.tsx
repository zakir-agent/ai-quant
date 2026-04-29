"use client";

import { useCallback, useEffect, useState } from "react";

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
  const [page, setPage] = useState<TelegramLogPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async (nextOffset: number, filter: StatusFilter) => {
    setLoading(true);
    setError(false);
    try {
      const data = await getTelegramLogs({
        limit: PAGE_SIZE,
        offset: nextOffset,
        status: filter === "all" ? undefined : filter,
      });
      setPage(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(offset, statusFilter);
  }, [offset, statusFilter, load]);

  const total = page?.total ?? 0;
  const items = page?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const changeFilter = (next: StatusFilter) => {
    setStatusFilter(next);
    setOffset(0);
    setExpanded(null);
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
          onClick={() => void load(offset, statusFilter)}
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

      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>
          {t("settings.tgTotal")}: {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || loading}
            className="rounded border border-[var(--border-primary)] px-2 py-0.5 disabled:opacity-40"
          >
            {t("common.prev")}
          </button>
          <span>
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total || loading}
            className="rounded border border-[var(--border-primary)] px-2 py-0.5 disabled:opacity-40"
          >
            {t("common.next")}
          </button>
        </div>
      </div>
    </div>
  );
}

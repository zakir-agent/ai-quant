"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import { useLanguage } from "@/components/LanguageProvider";
import type { NewsDailyStats } from "@/lib/api";

interface DailyBarChartProps {
  title: string;
  totalLabel: string;
  fetchStats: (days: number) => Promise<{ days: number; stats: NewsDailyStats[] }>;
}

export default function DailyBarChart({ title, totalLabel, fetchStats }: DailyBarChartProps) {
  const { t } = useLanguage();
  const [days, setDays] = useState<7 | 30>(7);
  const [stats, setStats] = useState<NewsDailyStats[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (d: 7 | 30) => {
      setLoading(true);
      fetchStats(d)
        .then((res) => setStats(res.stats))
        .catch(() => setStats([]))
        .finally(() => setLoading(false));
    },
    [fetchStats],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch wrapper sets loading state
    load(days);
  }, [days, load]);

  const maxCount = useMemo(() => Math.max(...stats.map((s) => s.count), 1), [stats]);
  const total = useMemo(() => stats.reduce((sum, s) => sum + s.count, 0), [stats]);

  const filled = useMemo(
    () =>
      stats.map((s) => {
        const [, m, d] = s.date.split("-");
        return { key: s.date, label: `${Number(m)}/${Number(d)}`, count: s.count };
      }),
    [stats],
  );

  return (
    <Card title={title}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          {totalLabel.replace("{n}", String(total))}
        </p>
        <div
          className="inline-flex items-center gap-0.5 rounded-md p-0.5"
          style={{ background: "var(--bg-secondary)" }}
        >
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="rounded px-2.5 py-0.5 text-xs font-medium transition-all"
              style={{
                background:
                  days === d
                    ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)"
                    : "transparent",
                color: days === d ? "var(--accent-primary)" : "var(--text-muted)",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">{t("common.loading")}</p>
      ) : (
        <>
          <div className="flex items-end gap-1" style={{ height: 100 }}>
            {filled.map((d) => {
              const barHeight = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
              return (
                <div
                  key={d.key}
                  className="group flex flex-1 flex-col items-center justify-end"
                  style={{ height: "100%" }}
                  title={`${d.label}: ${d.count}`}
                >
                  <span className="mb-1 text-[10px] leading-none text-[var(--text-secondary)] opacity-0 transition-opacity group-hover:opacity-100">
                    {d.count > 0 ? d.count : ""}
                  </span>
                  <div
                    className="w-full rounded-t transition-all duration-300"
                    style={{
                      height: d.count > 0 ? `${Math.max(barHeight, 4)}%` : 2,
                      minHeight: d.count > 0 ? 4 : 2,
                      background: d.count > 0 ? "var(--accent-primary)" : "var(--border-primary)",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-px">
            {filled.map((d, i) => {
              const show =
                days === 7 ? true : i % Math.ceil(days / 7) === 0 || i === filled.length - 1;
              return (
                <div key={d.key} className="flex flex-1 text-center">
                  <span className="w-full text-[9px] text-[var(--text-muted)]">
                    {show ? d.label : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

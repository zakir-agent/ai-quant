"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import { useLanguage } from "@/components/LanguageProvider";
import type { NewsDailyStats } from "@/lib/api";

interface SeriesConfig {
  label: string;
  color: string;
  totalLabel: string;
  fetchStats: (days: number) => Promise<{ days: number; stats: NewsDailyStats[] }>;
}

interface GroupedBarChartProps {
  title: string;
  series: SeriesConfig[];
}

export default function GroupedBarChart({ title, series }: GroupedBarChartProps) {
  const { t } = useLanguage();
  const [days, setDays] = useState<7 | 30>(7);
  const [allStats, setAllStats] = useState<NewsDailyStats[][]>(series.map(() => []));
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (d: 7 | 30) => {
      setLoading(true);
      Promise.all(series.map((s) => s.fetchStats(d)))
        .then((results) => setAllStats(results.map((r) => r.stats)))
        .catch(() => setAllStats(series.map(() => [])))
        .finally(() => setLoading(false));
    },
    [series],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch wrapper sets loading state
    load(days);
  }, [days, load]);

  const maxCount = useMemo(() => Math.max(...allStats.flat().map((s) => s.count), 1), [allStats]);

  const totals = useMemo(
    () => allStats.map((stats) => stats.reduce((sum, s) => sum + s.count, 0)),
    [allStats],
  );

  // Use the first series' dates as the shared date axis
  const dateEntries = useMemo(() => {
    const primary = allStats[0] ?? [];
    return primary.map((s) => {
      const [, m, d] = s.date.split("-");
      return { key: s.date, label: `${Number(m)}/${Number(d)}` };
    });
  }, [allStats]);

  return (
    <Card title={title}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {series.map((s, i) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="text-xs text-[var(--text-muted)]">
                {s.totalLabel.replace("{n}", String(totals[i] ?? 0))}
              </span>
            </div>
          ))}
        </div>
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
          <div className="flex h-[80px] items-end gap-1 sm:h-[100px]">
            {dateEntries.map((de) => {
              const seriesCounts = allStats.map(
                (stats) => stats.find((s) => s.date === de.key)?.count ?? 0,
              );
              // Build tooltip text
              const tooltip = series.map((s, i) => `${s.label}: ${seriesCounts[i]}`).join(" | ");

              return (
                <div
                  key={de.key}
                  className="group flex flex-1 items-end justify-center gap-px"
                  style={{ height: "100%" }}
                  title={`${de.label} — ${tooltip}`}
                >
                  {seriesCounts.map((count, i) => {
                    const barHeight = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    return (
                      <div
                        key={i}
                        className="flex flex-1 flex-col items-center justify-end"
                        style={{ height: "100%" }}
                      >
                        {count > 0 && (
                          <span className="mb-1 text-[10px] leading-none text-[var(--text-secondary)]">
                            {count}
                          </span>
                        )}
                        <div
                          className="w-full rounded-t transition-all duration-300"
                          style={{
                            height: count > 0 ? `${Math.max(barHeight, 4)}%` : 2,
                            minHeight: count > 0 ? 4 : 2,
                            background: count > 0 ? series[i].color : "var(--border-primary)",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-px">
            {dateEntries.map((de, i) => {
              const show =
                days === 7 ? true : i % Math.ceil(days / 7) === 0 || i === dateEntries.length - 1;
              return (
                <div key={de.key} className="flex flex-1 text-center">
                  <span className="w-full text-[9px] text-[var(--text-muted)]">
                    {show ? de.label : ""}
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

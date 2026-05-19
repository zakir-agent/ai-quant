"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DexPair } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import SegmentedControl from "@/components/ui/SegmentedControl";

type DexSortKey = "price_usd" | "volume_24h" | "liquidity_usd" | "txns_24h";
type SortState = { key: DexSortKey; dir: "asc" | "desc" };
type DexTab = "all" | "dexscreener_boosted" | "dexscreener_search";

// col widths: # | pair | chain | dex | price | vol | liq | txns
const COL_WIDTHS = ["5%", "20%", "10%", "12%", "13%", "14%", "14%", "12%"] as const;

function DexColgroup() {
  return (
    <colgroup>
      {COL_WIDTHS.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}

const thBase =
  "sticky top-0 z-10 border-b border-[var(--border-primary)] bg-[var(--bg-card)] py-2 pr-4 font-normal";

function DexSortableTh({
  sort,
  columnKey,
  right,
  label,
  hint,
  onSort,
}: {
  sort: SortState;
  columnKey: DexSortKey;
  right: boolean;
  label: string;
  hint: string;
  onSort: (k: DexSortKey) => void;
}) {
  const active = sort.key === columnKey;

  const arrow = (
    <span
      className={[
        "shrink-0 text-[11px] leading-none tracking-tight tabular-nums transition-[color,opacity] duration-150",
        active
          ? "text-[var(--accent-primary)]"
          : "text-[var(--text-muted)] opacity-50 group-hover:text-[var(--accent-primary)] group-hover:opacity-100",
      ].join(" ")}
      aria-hidden
    >
      {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  return (
    <th
      scope="col"
      className={`${thBase} align-bottom ${right ? "text-right" : "text-left"}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        title={hint}
        onClick={() => onSort(columnKey)}
        className={[
          "group inline-flex min-w-0 items-center gap-1 rounded-md py-1 text-sm transition-[color,background-color] duration-150",
          right ? "ml-auto" : "",
          active
            ? "text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          "focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-card)] focus-visible:outline-none",
        ].join(" ")}
      >
        {right && arrow}
        <span
          className={[
            "border-b-2 pb-px whitespace-nowrap transition-[border-color,font-weight] duration-150",
            active ? "border-[var(--accent-primary)] font-medium" : "border-transparent",
          ].join(" ")}
        >
          {label}
        </span>
        {!right && arrow}
      </button>
    </th>
  );
}

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function DexPanel({
  pairs,
  selectedKeys,
  onSelectedKeysChange,
}: {
  pairs: DexPair[];
  selectedKeys: Set<string>;
  onSelectedKeysChange: (keys: Set<string>) => void;
}) {
  const t = useT();
  const [sort, setSort] = useState<SortState>({ key: "volume_24h", dir: "desc" });
  const [activeTab, setActiveTab] = useState<DexTab>("all");

  const tabOptions = [
    { value: "all" as DexTab, label: t("dex.tabAll") },
    { value: "dexscreener_boosted" as DexTab, label: t("dex.tabBoosted") },
    { value: "dexscreener_search" as DexTab, label: t("dex.tabSearch") },
  ];

  const filteredPairs = useMemo(
    () => (activeTab === "all" ? pairs : pairs.filter((p) => p.source === activeTab)),
    [pairs, activeTab],
  );

  const sortedPairs = useMemo(() => {
    const next = [...filteredPairs];
    next.sort((a, b) => {
      const d = a[sort.key] - b[sort.key];
      return sort.dir === "asc" ? d : -d;
    });
    return next;
  }, [filteredPairs, sort]);

  const prevPairsRef = useRef(sortedPairs);

  useEffect(() => {
    if (sortedPairs !== prevPairsRef.current && sortedPairs.length > 0) {
      prevPairsRef.current = sortedPairs;
      onSelectedKeysChange(new Set([sortedPairs[0].pair]));
    }
  }, [sortedPairs, onSelectedKeysChange]);

  function onHeaderClick(key: DexSortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
  }

  const sortHint = t("table.dexSortHint");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SegmentedControl
        options={tabOptions}
        value={activeTab}
        onChange={setActiveTab}
        className="self-start"
      />
      {sortedPairs.length === 0 ? (
        <p className="py-8 text-center text-[var(--text-muted)]">{t("table.noDex")}</p>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <DexColgroup />
            <thead>
              <tr>
                <th className={`${thBase} text-center text-[var(--text-muted)]`}>
                  {t("table.rank")}
                </th>
                <th className={`${thBase} text-left text-[var(--text-muted)]`}>
                  {t("table.pair")}
                </th>
                <th className={`${thBase} text-left text-[var(--text-muted)]`}>
                  {t("table.chain")}
                </th>
                <th className={`${thBase} text-left text-[var(--text-muted)]`}>{t("table.dex")}</th>
                <DexSortableTh
                  sort={sort}
                  columnKey="price_usd"
                  right
                  label={t("table.price")}
                  hint={sortHint}
                  onSort={onHeaderClick}
                />
                <DexSortableTh
                  sort={sort}
                  columnKey="volume_24h"
                  right
                  label={t("table.volume24h")}
                  hint={sortHint}
                  onSort={onHeaderClick}
                />
                <DexSortableTh
                  sort={sort}
                  columnKey="liquidity_usd"
                  right
                  label={t("table.liquidity")}
                  hint={sortHint}
                  onSort={onHeaderClick}
                />
                <DexSortableTh
                  sort={sort}
                  columnKey="txns_24h"
                  right
                  label={t("table.txns24h")}
                  hint={sortHint}
                  onSort={onHeaderClick}
                />
              </tr>
            </thead>
            <tbody>
              {sortedPairs.map((p, idx) => (
                <tr
                  key={`${p.source}-${p.chain}-${p.dex}-${p.pair}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) {
                      const next = new Set(selectedKeys);
                      if (next.has(p.pair)) next.delete(p.pair);
                      else next.add(p.pair);
                      onSelectedKeysChange(next);
                    } else {
                      onSelectedKeysChange(new Set([p.pair]));
                    }
                  }}
                  className="border-b border-[var(--border-primary)]/50 cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]"
                  style={selectedKeys.has(p.pair) ? { backgroundColor: "color-mix(in srgb, var(--accent-primary) 10%, transparent)" } : undefined}
                >
                  <td className="py-2 text-center text-xs text-[var(--text-muted)]">{idx + 1}</td>
                  <td
                    className="truncate py-2 pr-4 font-medium text-[var(--text-primary)]"
                    title={p.pair}
                  >
                    {p.pair}
                  </td>
                  <td className="truncate py-2 pr-4 text-[var(--text-secondary)]" title={p.chain}>
                    {p.chain}
                  </td>
                  <td className="truncate py-2 pr-4 text-[var(--text-secondary)]" title={p.dex}>
                    {p.dex}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-[var(--text-primary)]">
                    ${p.price_usd.toFixed(p.price_usd < 1 ? 6 : 2)}
                  </td>
                  <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                    {formatUsd(p.volume_24h)}
                  </td>
                  <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                    {formatUsd(p.liquidity_usd)}
                  </td>
                  <td className="py-2 pr-4 text-right text-[var(--text-muted)]">
                    {p.txns_24h.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

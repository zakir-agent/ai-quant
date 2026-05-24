"use client";

import type { CoinOverview } from "@/lib/api";
import Image from "next/image";
import { useT } from "@/components/LanguageProvider";

interface MarketOverviewProps {
  coins: CoinOverview[];
  livePrices?: Record<string, { price: number; change_pct: number }>;
}

function formatNum(n: number | null, decimals = 2): string {
  if (n === null || n === undefined) return "-";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(decimals)}K`;
  return `$${n.toFixed(decimals)}`;
}

function PctBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="text-[var(--text-muted)]">-</span>;
  const color = value >= 0 ? "var(--success)" : "var(--danger)";
  return (
    <span style={{ color }}>
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export default function MarketOverview({ coins, livePrices }: MarketOverviewProps) {
  const t = useT();

  if (!coins.length) {
    return <p className="py-8 text-center text-[var(--text-muted)]">{t("table.noDataCollect")}</p>;
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-primary)] text-[var(--text-muted)]">
            <th className="hidden py-2 pr-4 text-left sm:table-cell">{t("table.rank")}</th>
            <th className="py-2 pr-4 text-left">{t("table.coin")}</th>
            <th className="py-2 pr-4 text-right">{t("table.price")}</th>
            <th className="hidden py-2 pr-4 text-right sm:table-cell">1h</th>
            <th className="py-2 pr-4 text-right">24h</th>
            <th className="hidden py-2 pr-4 text-right md:table-cell">7d</th>
            <th className="hidden py-2 text-right md:table-cell">{t("table.marketCap")}</th>
          </tr>
        </thead>
        <tbody>
          {coins.map((coin) => {
            const liveKey = `${coin.symbol.toUpperCase()}/USDT`;
            const live = livePrices?.[liveKey];
            const displayPrice = live?.price ?? coin.current_price;
            return (
              <tr
                key={coin.id}
                className="border-b border-[var(--border-primary)]/50 transition-colors hover:bg-[var(--bg-card-hover)]"
              >
                <td className="hidden py-2 pr-4 text-[var(--text-muted)] sm:table-cell">
                  {coin.market_cap_rank}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    {coin.image && (
                      <Image
                        src={coin.image}
                        alt={coin.symbol}
                        width={20}
                        height={20}
                        loading="lazy"
                        unoptimized
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    )}
                    <span className="font-medium text-[var(--text-primary)]">{coin.symbol}</span>
                    <span className="hidden text-xs text-[var(--text-muted)] sm:inline">
                      {coin.name}
                    </span>
                  </div>
                </td>
                <td className="py-2 pr-4 text-right font-mono text-[var(--text-primary)]">
                  {live && (
                    <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  )}
                  $
                  {displayPrice?.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }) ?? "-"}
                </td>
                <td className="hidden py-2 pr-4 text-right sm:table-cell">
                  <PctBadge value={coin.price_change_1h} />
                </td>
                <td className="py-2 pr-4 text-right">
                  <PctBadge value={coin.price_change_24h} />
                </td>
                <td className="hidden py-2 pr-4 text-right md:table-cell">
                  <PctBadge value={coin.price_change_7d} />
                </td>
                <td className="hidden py-2 text-right text-[var(--text-secondary)] md:table-cell">
                  {formatNum(coin.market_cap)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

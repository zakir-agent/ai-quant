"use client";

import type { CoinOverview } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

interface MarketOverviewProps {
  coins: CoinOverview[];
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

export default function MarketOverview({ coins }: MarketOverviewProps) {
  const t = useT();

  if (!coins.length) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        {t("table.noDataCollect")}
      </p>
    );
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[var(--text-muted)] border-b border-[var(--border-primary)]">
            <th className="text-left py-2 pr-4">{t("table.rank")}</th>
            <th className="text-left py-2 pr-4">{t("table.coin")}</th>
            <th className="text-right py-2 pr-4">{t("table.price")}</th>
            <th className="text-right py-2 pr-4">1h</th>
            <th className="text-right py-2 pr-4">24h</th>
            <th className="text-right py-2 pr-4">7d</th>
            <th className="text-right py-2">{t("table.marketCap")}</th>
          </tr>
        </thead>
        <tbody>
          {coins.map((coin) => (
            <tr
              key={coin.id}
              className="border-b border-[var(--border-primary)]/50 hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <td className="py-2 pr-4 text-[var(--text-muted)]">{coin.market_cap_rank}</td>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  {coin.image && (
                    <img src={coin.image} alt={coin.symbol} className="w-5 h-5 rounded-full" />
                  )}
                  <span className="font-medium text-[var(--text-primary)]">{coin.symbol}</span>
                  <span className="text-[var(--text-muted)] text-xs">{coin.name}</span>
                </div>
              </td>
              <td className="py-2 pr-4 text-right font-mono text-[var(--text-primary)]">
                $
                {coin.current_price?.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) ?? "-"}
              </td>
              <td className="py-2 pr-4 text-right">
                <PctBadge value={coin.price_change_1h} />
              </td>
              <td className="py-2 pr-4 text-right">
                <PctBadge value={coin.price_change_24h} />
              </td>
              <td className="py-2 pr-4 text-right">
                <PctBadge value={coin.price_change_7d} />
              </td>
              <td className="py-2 text-right text-[var(--text-secondary)]">
                {formatNum(coin.market_cap)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import type { CoinOverview } from "@/lib/api";

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
  if (value === null || value === undefined) return <span className="text-gray-500">-</span>;
  const color = value >= 0 ? "text-green-400" : "text-red-400";
  return <span className={color}>{value >= 0 ? "+" : ""}{value.toFixed(2)}%</span>;
}

export default function MarketOverview({ coins }: MarketOverviewProps) {
  if (!coins.length) {
    return <p className="text-gray-500 text-center py-8">暂无数据，请点击采集</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-800">
            <th className="text-left py-2 pr-4">#</th>
            <th className="text-left py-2 pr-4">币种</th>
            <th className="text-right py-2 pr-4">价格</th>
            <th className="text-right py-2 pr-4">1h</th>
            <th className="text-right py-2 pr-4">24h</th>
            <th className="text-right py-2 pr-4">7d</th>
            <th className="text-right py-2">市值</th>
          </tr>
        </thead>
        <tbody>
          {coins.map((coin) => (
            <tr key={coin.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-2 pr-4 text-gray-500">{coin.market_cap_rank}</td>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  {coin.image && (
                    <img src={coin.image} alt={coin.symbol} className="w-5 h-5 rounded-full" />
                  )}
                  <span className="font-medium">{coin.symbol}</span>
                  <span className="text-gray-500 text-xs">{coin.name}</span>
                </div>
              </td>
              <td className="py-2 pr-4 text-right font-mono">
                ${coin.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "-"}
              </td>
              <td className="py-2 pr-4 text-right"><PctBadge value={coin.price_change_1h} /></td>
              <td className="py-2 pr-4 text-right"><PctBadge value={coin.price_change_24h} /></td>
              <td className="py-2 pr-4 text-right"><PctBadge value={coin.price_change_7d} /></td>
              <td className="py-2 text-right text-gray-400">{formatNum(coin.market_cap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

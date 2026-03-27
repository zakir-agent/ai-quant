"use client";

import type { DexPair } from "@/lib/api";

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function DexPanel({ pairs }: { pairs: DexPair[] }) {
  if (!pairs.length) {
    return <p className="text-gray-500 text-center py-8">暂无 DEX 数据，请点击采集</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-800">
            <th className="text-left py-2 pr-4">交易对</th>
            <th className="text-left py-2 pr-4">链</th>
            <th className="text-left py-2 pr-4">DEX</th>
            <th className="text-right py-2 pr-4">价格</th>
            <th className="text-right py-2 pr-4">24h 交易量</th>
            <th className="text-right py-2 pr-4">流动性</th>
            <th className="text-right py-2">24h 笔数</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p, i) => (
            <tr key={`${p.chain}-${p.dex}-${p.pair}-${i}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-2 pr-4 font-medium">{p.pair}</td>
              <td className="py-2 pr-4 text-gray-400">{p.chain}</td>
              <td className="py-2 pr-4 text-gray-400">{p.dex}</td>
              <td className="py-2 pr-4 text-right font-mono">${p.price_usd.toFixed(p.price_usd < 1 ? 6 : 2)}</td>
              <td className="py-2 pr-4 text-right">{formatUsd(p.volume_24h)}</td>
              <td className="py-2 pr-4 text-right">{formatUsd(p.liquidity_usd)}</td>
              <td className="py-2 text-right text-gray-400">{p.txns_24h.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

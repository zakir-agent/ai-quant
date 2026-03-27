"use client";

import type { DefiProtocol } from "@/lib/api";

function formatTvl(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function DefiPanel({ protocols }: { protocols: DefiProtocol[] }) {
  if (!protocols.length) {
    return <p className="text-gray-500 text-center py-8">暂无 DeFi 数据，请点击采集</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-800">
            <th className="text-left py-2 pr-4">#</th>
            <th className="text-left py-2 pr-4">协议</th>
            <th className="text-left py-2 pr-4">分类</th>
            <th className="text-left py-2 pr-4">链</th>
            <th className="text-right py-2 pr-4">TVL</th>
            <th className="text-right py-2">24h 变化</th>
          </tr>
        </thead>
        <tbody>
          {protocols.map((p, i) => (
            <tr key={p.protocol} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
              <td className="py-2 pr-4 font-medium">{p.protocol}</td>
              <td className="py-2 pr-4">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                  {p.category}
                </span>
              </td>
              <td className="py-2 pr-4 text-gray-400">{p.chain}</td>
              <td className="py-2 pr-4 text-right font-mono">{formatTvl(p.tvl)}</td>
              <td className="py-2 text-right">
                {p.tvl_change_24h !== null ? (
                  <span className={p.tvl_change_24h >= 0 ? "text-green-400" : "text-red-400"}>
                    {p.tvl_change_24h >= 0 ? "+" : ""}
                    {p.tvl_change_24h.toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

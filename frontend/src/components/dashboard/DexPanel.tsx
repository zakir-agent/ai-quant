"use client";

import type { DexPair } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function DexPanel({ pairs }: { pairs: DexPair[] }) {
  const t = useT();

  if (!pairs.length) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        {t("table.noDex")}
      </p>
    );
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[var(--text-muted)] border-b border-[var(--border-primary)]">
            <th className="text-left py-2 pr-4">{t("table.pair")}</th>
            <th className="text-left py-2 pr-4">{t("table.chain")}</th>
            <th className="text-left py-2 pr-4">{t("table.dex")}</th>
            <th className="text-right py-2 pr-4">{t("table.price")}</th>
            <th className="text-right py-2 pr-4">{t("table.volume24h")}</th>
            <th className="text-right py-2 pr-4">{t("table.liquidity")}</th>
            <th className="text-right py-2">{t("table.txns24h")}</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p, i) => (
            <tr
              key={`${p.chain}-${p.dex}-${p.pair}-${i}`}
              className="border-b border-[var(--border-primary)]/50 hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{p.pair}</td>
              <td className="py-2 pr-4 text-[var(--text-secondary)]">{p.chain}</td>
              <td className="py-2 pr-4 text-[var(--text-secondary)]">{p.dex}</td>
              <td className="py-2 pr-4 text-right font-mono text-[var(--text-primary)]">
                ${p.price_usd.toFixed(p.price_usd < 1 ? 6 : 2)}
              </td>
              <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                {formatUsd(p.volume_24h)}
              </td>
              <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                {formatUsd(p.liquidity_usd)}
              </td>
              <td className="py-2 text-right text-[var(--text-muted)]">
                {p.txns_24h.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

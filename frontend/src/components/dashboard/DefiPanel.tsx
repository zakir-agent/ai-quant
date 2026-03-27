"use client";

import type { DefiProtocol } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import Badge from "@/components/ui/Badge";

function formatTvl(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function DefiPanel({ protocols }: { protocols: DefiProtocol[] }) {
  const t = useT();

  if (!protocols.length) {
    return (
      <p className="text-[var(--text-muted)] text-center py-8">
        {t("table.noDefi")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[var(--text-muted)] border-b border-[var(--border-primary)]">
            <th className="text-left py-2 pr-4">{t("table.rank")}</th>
            <th className="text-left py-2 pr-4">{t("table.protocol")}</th>
            <th className="text-left py-2 pr-4">{t("table.category")}</th>
            <th className="text-left py-2 pr-4">{t("table.chain")}</th>
            <th className="text-right py-2 pr-4">{t("table.tvl")}</th>
            <th className="text-right py-2">{t("table.change24h")}</th>
          </tr>
        </thead>
        <tbody>
          {protocols.map((p, i) => (
            <tr
              key={p.protocol}
              className="border-b border-[var(--border-primary)]/50 hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <td className="py-2 pr-4 text-[var(--text-muted)]">{i + 1}</td>
              <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{p.protocol}</td>
              <td className="py-2 pr-4">
                <Badge variant="default">{p.category}</Badge>
              </td>
              <td className="py-2 pr-4 text-[var(--text-secondary)]">{p.chain}</td>
              <td className="py-2 pr-4 text-right font-mono text-[var(--text-primary)]">
                {formatTvl(p.tvl)}
              </td>
              <td className="py-2 text-right">
                {p.tvl_change_24h !== null ? (
                  <span
                    style={{
                      color: p.tvl_change_24h >= 0 ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    {p.tvl_change_24h >= 0 ? "+" : ""}
                    {p.tvl_change_24h.toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

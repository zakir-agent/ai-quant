"use client";

import { useEffect, useRef } from "react";
import type { DefiProtocol } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import Badge from "@/components/ui/Badge";

function formatTvl(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function DefiPanel({
  protocols,
  selectedKeys,
  onSelectedKeysChange,
}: {
  protocols: DefiProtocol[];
  selectedKeys: Set<string>;
  onSelectedKeysChange: (keys: Set<string>) => void;
}) {
  const t = useT();
  const prevProtocolsRef = useRef(protocols);

  useEffect(() => {
    if (protocols !== prevProtocolsRef.current && protocols.length > 0) {
      prevProtocolsRef.current = protocols;
      onSelectedKeysChange(new Set([protocols[0].protocol]));
    }
  }, [protocols, onSelectedKeysChange]);

  if (!protocols.length) {
    return <p className="py-8 text-center text-[var(--text-muted)]">{t("table.noDefi")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-primary)] text-[var(--text-muted)]">
            <th className="py-2 pr-4 text-left">{t("table.rank")}</th>
            <th className="py-2 pr-4 text-left">{t("table.protocol")}</th>
            <th className="py-2 pr-4 text-left">{t("table.category")}</th>
            <th className="py-2 pr-4 text-left">{t("table.chain")}</th>
            <th className="py-2 pr-4 text-right">{t("table.tvl")}</th>
            <th className="py-2 text-right">{t("table.change24h")}</th>
          </tr>
        </thead>
        <tbody>
          {protocols.map((p, i) => (
            <tr
              key={p.protocol}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) {
                  const next = new Set(selectedKeys);
                  if (next.has(p.protocol)) next.delete(p.protocol);
                  else next.add(p.protocol);
                  onSelectedKeysChange(next);
                } else {
                  onSelectedKeysChange(new Set([p.protocol]));
                }
              }}
              className="border-b border-[var(--border-primary)]/50 cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]"
              style={selectedKeys.has(p.protocol) ? { backgroundColor: "color-mix(in srgb, var(--accent-primary) 10%, transparent)" } : undefined}
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

"use client";

import { useT } from "@/components/LanguageProvider";

interface ScopeTabsProps {
  symbols: string[];
  activeScope: string;
  onScopeChange: (scope: string) => void;
}

function scopeDisplayLabel(scope: string): string {
  return scope.includes("/") ? scope.split("/")[0] : scope;
}

export default function ScopeTabs({ symbols, activeScope, onScopeChange }: ScopeTabsProps) {
  const t = useT();
  const tabs = [
    { key: "market", label: t("analysis.marketWide") },
    ...symbols.map((s) => ({ key: s, label: scopeDisplayLabel(s) })),
  ];

  return (
    <div
      className="inline-flex items-center gap-1 overflow-x-auto rounded-lg p-1"
      style={{ background: "var(--bg-card)" }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onScopeChange(tab.key)}
          className="whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200"
          style={{
            background:
              activeScope === tab.key
                ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)"
                : "transparent",
            color:
              activeScope === tab.key ? "var(--accent-primary)" : "var(--text-muted)",
            boxShadow: activeScope === tab.key ? "0 0 12px var(--glow-color)" : "none",
          }}
          onMouseEnter={(e) => {
            if (activeScope !== tab.key) {
              e.currentTarget.style.background =
                "color-mix(in srgb, var(--accent-primary) 6%, transparent)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeScope !== tab.key) {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

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

export default function ScopeTabs({
  symbols,
  activeScope,
  onScopeChange,
}: ScopeTabsProps) {
  const t = useT();
  const tabs = [
    { key: "market", label: t("analysis.marketWide") },
    ...symbols.map((s) => ({ key: s, label: scopeDisplayLabel(s) })),
  ];

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/6 pb-px">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onScopeChange(tab.key)}
          className={`whitespace-nowrap rounded-t-md px-4 py-2 text-sm transition-colors ${
            activeScope === tab.key
              ? "border-b-2 border-[var(--accent-primary)] bg-white/5 font-medium text-white"
              : "text-neutral-400 hover:bg-white/3 hover:text-white"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

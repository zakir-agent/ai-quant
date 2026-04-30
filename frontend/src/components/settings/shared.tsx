"use client";

import React from "react";

export function StatusDot({ ok, color, label }: { ok?: boolean; color?: string; label?: string }) {
  const bg = color || (ok ? "var(--success)" : "var(--danger)");
  if (!label) {
    return <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: bg }} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: bg }} />
      <span style={{ color: bg }}>{label}</span>
    </span>
  );
}

export function healthColor(status: string) {
  if (status === "ok") return "var(--success)";
  if (status === "degraded") return "var(--warning)";
  if (status === "alert") return "var(--danger)";
  return "var(--text-muted)";
}

export function healthLabel(status: string, t: (key: string) => string) {
  if (status === "ok") return t("settings.healthOk");
  if (status === "degraded") return t("settings.healthDegraded");
  if (status === "alert") return t("settings.healthAlert");
  return status;
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 pt-4 pb-1">
      <span className="h-5 w-1 rounded-full bg-[var(--accent-primary)]" />
      <h3 className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
        {title}
      </h3>
    </div>
  );
}

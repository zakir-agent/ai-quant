interface StatusDotProps {
  ok?: boolean;
  color?: string;
  label?: string;
}

export function StatusDot({ ok, color, label }: StatusDotProps) {
  const bg = color || (ok ? "var(--success)" : "var(--danger)");
  if (!label) {
    return <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: bg }} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: bg }}
      />
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

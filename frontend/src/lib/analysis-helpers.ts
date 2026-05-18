type TFunction = (key: string) => string;

export function trendVariant(trend: string): "success" | "danger" | "warning" {
  if (trend === "bullish") return "success";
  if (trend === "bearish") return "danger";
  return "warning";
}

export function trendLabel(trend: string, t: TFunction): string {
  if (trend === "bullish") return t("analysis.bullish");
  if (trend === "bearish") return t("analysis.bearish");
  return t("analysis.neutral");
}

export function riskVariant(level: string): "success" | "warning" | "danger" {
  if (level === "low") return "success";
  if (level === "high") return "danger";
  return "warning";
}

export function riskLabel(level: string, t: TFunction): string {
  if (level === "low") return t("analysis.riskLow");
  if (level === "high") return t("analysis.riskHigh");
  return t("analysis.riskMedium");
}

const ACTION_COLORS: Record<string, string> = {
  buy: "var(--success)",
  sell: "var(--danger)",
  hold: "var(--warning)",
  watch: "var(--accent-primary)",
};

export function actionColor(action: string): string {
  return ACTION_COLORS[action] || "var(--text-muted)";
}

export function actionLabel(action: string, t: TFunction): string {
  switch (action) {
    case "buy":
      return t("analysis.buy");
    case "sell":
      return t("analysis.sell");
    case "hold":
      return t("analysis.hold");
    case "watch":
      return t("analysis.watch");
    default:
      return action;
  }
}

export function confidenceLabel(c: string, t: TFunction): string {
  if (c === "high") return t("analysis.high");
  if (c === "medium") return t("analysis.medium");
  return t("analysis.low");
}

export function sentimentColor(score: number): string {
  if (score > 30) return "var(--success)";
  if (score < -30) return "var(--danger)";
  return "var(--warning)";
}

/** Normalize a raw symbol like "BTC" to scope format "BTC/USDT". */
export function normalizeToScope(raw: string): string {
  return raw.includes("/") ? raw : raw + "/USDT";
}

/** Extract the base symbol from a scope like "BTC/USDT" → "BTC". */
export function scopeToSymbol(scope: string): string {
  return scope.split("/")[0];
}

export function formatTimeSpan(dateA: string, dateB: string, t: TFunction): string {
  const diffMs = Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime());
  const totalMin = Math.round(diffMs / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) {
    return t("analysis.intervalDays").replace("{n}", String(days));
  }
  return t("analysis.intervalHours").replace("{n}", String(hours)).replace("{n2}", String(mins));
}

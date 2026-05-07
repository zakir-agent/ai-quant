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

export function actionColor(action: string): string {
  const colors: Record<string, string> = {
    buy: "var(--success)",
    sell: "var(--danger)",
    hold: "var(--warning)",
    watch: "var(--accent-primary)",
  };
  return colors[action] || "var(--text-muted)";
}

export function actionLabel(action: string, t: TFunction): string {
  const labels: Record<string, string> = {
    buy: t("analysis.buy"),
    sell: t("analysis.sell"),
    hold: t("analysis.hold"),
    watch: t("analysis.watch"),
  };
  return labels[action] || action;
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

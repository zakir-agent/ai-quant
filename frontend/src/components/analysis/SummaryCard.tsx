"use client";

import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

interface Props {
  report: AnalysisReport;
  onClick?: () => void;
}

export default function SummaryCard({ report, onClick }: Props) {
  const t = useT();

  return (
    <div
      className="cursor-pointer rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4 transition-all hover:border-white/12 hover:-translate-y-0.5 col-span-2"
      onClick={onClick}
    >
      <p className="mb-2 text-xs text-neutral-500">{t("analysis.summary")}</p>
      <p className="text-sm leading-relaxed">{report.summary}</p>
    </div>
  );
}

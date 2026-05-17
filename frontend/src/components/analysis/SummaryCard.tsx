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
      className="col-span-3 cursor-pointer rounded-lg border border-white/6 bg-[var(--bg-secondary)] p-4 transition-all hover:-translate-y-0.5 hover:border-white/12"
      onClick={onClick}
    >
      <p className="mb-2 text-xs text-neutral-500">{t("analysis.summary")}</p>
      <p className="text-sm leading-relaxed">{report.summary}</p>
    </div>
  );
}

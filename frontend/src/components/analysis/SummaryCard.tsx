"use client";

import Card from "@/components/ui/Card";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

interface Props {
  report: AnalysisReport;
  onClick?: () => void;
}

export default function SummaryCard({ report, onClick }: Props) {
  const t = useT();

  return (
    <Card
      title={t("analysis.summary")}
      className="col-span-full cursor-pointer"
      onClick={onClick}
    >
      <p className="text-sm leading-relaxed">{report.summary}</p>
    </Card>
  );
}

"use client";

import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import Card from "./Card";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number | null;
  icon?: React.ReactNode;
  className?: string;
}

export default function StatCard({ label, value, change, icon, className = "" }: StatCardProps) {
  return (
    <Card className={`p-3 ${className}`} noPadding>
      <div className="flex items-start justify-between">
        {icon && <div className="mb-2 text-[var(--accent-primary)]">{icon}</div>}
        {change != null && (
          <div
            className={`flex items-center gap-0.5 text-xs font-medium ${
              change >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
            }`}
          >
            {change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(change).toFixed(2)}%
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-[var(--text-primary)]">{value}</div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">{label}</div>
    </Card>
  );
}

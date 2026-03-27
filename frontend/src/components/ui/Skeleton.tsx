"use client";

import React from "react";

interface SkeletonProps {
  className?: string;
  variant?: "line" | "circle" | "rect";
}

const variantClasses: Record<NonNullable<SkeletonProps["variant"]>, string> = {
  line: "h-4 w-full rounded",
  circle: "w-10 h-10 rounded-full",
  rect: "w-full h-24 rounded-lg",
};

export default function Skeleton({ className = "", variant = "line" }: SkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden bg-[var(--bg-card)] ${variantClasses[variant]} ${className}`}
    >
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} variant="line" className="h-8" />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return <Skeleton variant="rect" className="h-[400px]" />;
}

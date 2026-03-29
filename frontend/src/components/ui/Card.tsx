"use client";

import React from "react";

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export default function Card({ title, children, className = "", noPadding = false }: CardProps) {
  return (
    <div
      className={`flex flex-col rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-[var(--card-shadow)] transition-colors duration-200 hover:border-[var(--border-hover)] ${noPadding ? "" : "p-4"} ${className} `}
    >
      {title && (
        <h3 className="mb-3 shrink-0 text-sm font-semibold text-[var(--text-muted)] uppercase">
          {title}
        </h3>
      )}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

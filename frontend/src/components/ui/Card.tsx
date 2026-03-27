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
      className={`
        rounded-xl border transition-colors duration-200 flex flex-col
        bg-[var(--bg-card)] border-[var(--border-primary)]
        shadow-[var(--card-shadow)]
        hover:border-[var(--border-hover)]
        ${noPadding ? "" : "p-4"}
        ${className}
      `}
    >
      {title && (
        <h3 className="text-sm font-semibold uppercase text-[var(--text-muted)] mb-3 shrink-0">
          {title}
        </h3>
      )}
      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}

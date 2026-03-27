"use client";

import React from "react";

interface BadgeProps {
  variant: "success" | "danger" | "warning" | "info" | "default";
  children: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
}

const variantColors: Record<BadgeProps["variant"], string> = {
  success: "var(--success)",
  danger: "var(--danger)",
  warning: "var(--warning)",
  info: "var(--accent-primary)",
  default: "var(--text-muted)",
};

export default function Badge({ variant, children, size = "sm", className = "" }: BadgeProps) {
  const color = variantColors[variant];
  const sizeClasses = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses} ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      {children}
    </span>
  );
}

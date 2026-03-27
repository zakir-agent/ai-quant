"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeIndex = options.findIndex((o) => o.value === value);
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    const btn = buttons[activeIndex];
    if (btn) {
      setIndicator({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
      });
    }
  }, [options, value]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex rounded-lg bg-[var(--bg-card)] p-1 ${className}`}
    >
      <div
        className="absolute top-1 bottom-1 rounded-md transition-all duration-200 bg-[var(--accent-primary)]/20"
        style={{ left: indicator.left, width: indicator.width }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`relative z-10 px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 ${
            value === option.value
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

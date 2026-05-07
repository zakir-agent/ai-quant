"use client";

interface ErrorBlockProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export default function ErrorBlock({ message, onRetry, retryLabel = "重试" }: ErrorBlockProps) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-4 py-3"
      style={{
        backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
      }}
    >
      <span className="text-sm" style={{ color: "var(--danger)" }}>
        {message}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="ml-4 shrink-0 rounded px-3 py-1 text-sm font-medium transition-colors hover:opacity-80"
          style={{
            color: "var(--danger)",
            border: "1px solid var(--danger)",
          }}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

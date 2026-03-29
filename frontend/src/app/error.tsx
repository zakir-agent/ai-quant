"use client";

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div
        className="rounded-lg px-6 py-4 text-center"
        style={{
          backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
        }}
      >
        <h2 className="mb-2 text-lg font-semibold" style={{ color: "var(--danger)" }}>
          页面出现异常
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {error.message || "发生了意外错误"}
        </p>
      </div>
      <button
        onClick={() => unstable_retry()}
        className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        style={{
          backgroundColor: "var(--accent-primary)",
          color: "#fff",
        }}
      >
        重试
      </button>
    </div>
  );
}

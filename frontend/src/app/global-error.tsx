"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0f1a",
          color: "#f1f5f9",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>系统异��</h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#94a3b8",
              marginBottom: "1.5rem",
            }}
          >
            {error.message || "发生了意外错误"}
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              padding: "0.5rem 1.5rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#3b82f6",
              color: "#fff",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            刷新页面
          </button>
        </div>
      </body>
    </html>
  );
}

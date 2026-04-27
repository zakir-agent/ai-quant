/**
 * Resolve backend HTTP / WS URLs in the browser so LAN access works:
 * env often uses localhost, but the browser must use the same host as the page
 * (e.g. 192.168.x.x) when the user opens the app by machine IP.
 */

function pageHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname || "127.0.0.1";
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function envApiUrl(): URL | null {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Hostname the browser should use to reach the API (same machine as Next dev in typical setups). */
function effectiveBackendHost(): string {
  const page = pageHostname();
  const parsed = envApiUrl();
  if (!parsed) return page || "127.0.0.1";
  const envHost = parsed.hostname;
  const pageIsLoopback = !page || isLoopbackHost(page);
  if (isLoopbackHost(envHost) && !pageIsLoopback) {
    return page;
  }
  return envHost;
}

function effectiveBackendPort(): number {
  const parsed = envApiUrl();
  if (parsed?.port) return parseInt(parsed.port, 10);
  return 8000;
}

function effectiveBackendUseHttps(): boolean {
  const parsed = envApiUrl();
  if (parsed) return parsed.protocol === "https:";
  if (typeof window !== "undefined") return window.location.protocol === "https:";
  return false;
}

/** HTTP origin for API calls (no trailing slash). */
export function getApiBase(): string {
  const parsed = envApiUrl();
  if (typeof window !== "undefined" && !parsed) {
    const h = pageHostname() || "127.0.0.1";
    return `${window.location.protocol}//${h}:8000`;
  }
  if (typeof window !== "undefined" && parsed) {
    const proto = effectiveBackendUseHttps() ? "https:" : "http:";
    const host = effectiveBackendHost();
    const port = effectiveBackendPort();
    return `${proto}//${host}:${port}`;
  }
  if (parsed) return parsed.origin;
  return "http://127.0.0.1:8000";
}

function normalizeWsUrlIfEnvLocalhost(wsUrl: string): string {
  const page = pageHostname();
  const pageIsLoopback = !page || isLoopbackHost(page);
  if (pageIsLoopback) return wsUrl;
  try {
    const u = new URL(wsUrl);
    if (!isLoopbackHost(u.hostname)) return wsUrl;
    u.hostname = page;
    return u.toString();
  } catch {
    return wsUrl;
  }
}

/** WebSocket URL for /ws on the same backend as getApiBase(). */
export function getWebSocketUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WS_URL;
  if (fromEnv) return normalizeWsUrlIfEnvLocalhost(fromEnv);

  const https = effectiveBackendUseHttps();
  const host = effectiveBackendHost();
  const port = effectiveBackendPort();
  const wsProto = https ? "wss:" : "ws:";
  return `${wsProto}//${host}:${port}/ws`;
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: allow HMR WebSocket (/_next/webpack-hmr) when the app is opened by
  // LAN IP or *.local hostname. Next.js 15+ otherwise returns 403 on that socket.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  output: "export",
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.coingecko.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;

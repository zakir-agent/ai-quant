import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

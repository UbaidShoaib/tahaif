import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "*.tahaif.pk" },
    ],
  },
  experimental: {
    // Re-enable typedRoutes once all pages are scaffolded
    // typedRoutes: true,
  },
};

export default nextConfig;

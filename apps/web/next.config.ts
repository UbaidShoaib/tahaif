import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_HOST = new URL(API_URL).host;

// Content-Security-Policy — tightened for production; localhost entries cover dev.
const CSP = [
  "default-src 'self'",
  // Scripts: Next.js inlines critical chunks; unsafe-eval needed for dev HMR only.
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self' ${API_URL} https://*.sentry.io wss: ws:`,
  `img-src 'self' data: blob: https://images.unsplash.com https://*.tahaif.pk http://localhost http://${API_HOST}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "https", hostname: "*.tahaif.pk" },
    ],
  },

  async headers() {
    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
      {
        // Allow the service worker scope on root
        source: "/",
        headers: [{ key: "Service-Worker-Allowed", value: "/" }],
      },
    ];
  },

  // Compress responses
  compress: true,

  // Strip powered-by header
  poweredByHeader: false,
};

export default nextConfig;

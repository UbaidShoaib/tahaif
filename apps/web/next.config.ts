import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { imageHosts } from "./lib/image-hosts";

// Locale from a cookie, no URL prefix (i18n/request.ts, ADR 0005).
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_HOST = new URL(API_URL).host;
// CSP source expressions with a path and no trailing slash match that one URL
// exactly, so "http://host/api/v1" would block every call under it. Use the origin.
const API_ORIGIN = new URL(API_URL).origin;

// One list for next/image and the CSP, extendable via NEXT_PUBLIC_IMAGE_HOSTS (lib/image-hosts.ts).
const IMAGE_HOSTS = imageHosts();
const IMG_SRC = IMAGE_HOSTS.map((h) => `${h.protocol}://${h.hostname}`).join(" ");

// Content-Security-Policy — tightened for production; localhost entries cover dev.
const CSP = [
  "default-src 'self'",
  // Scripts: Next.js inlines critical chunks; unsafe-eval needed for dev HMR only.
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self' ${API_ORIGIN} https://*.sentry.io wss: ws:`,
  `img-src 'self' data: blob: ${IMG_SRC} http://${API_HOST}`,
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
  outputFileTracingRoot: path.join(__dirname, "../.."),

  images: {
    remotePatterns: IMAGE_HOSTS,
    formats: ["image/avif", "image/webp"],
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

export default withNextIntl(nextConfig);

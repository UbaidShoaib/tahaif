import path from "path";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { imageHosts } from "./lib/image-hosts";
import { noindexHeaders, requireSiteUrl } from "./lib/seo";

// Locale from a cookie, no URL prefix (i18n/request.ts, ADR 0005).
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
import { withSentryConfig } from "@sentry/nextjs/config";

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
      // Keep private and token pages out of search results (lib/seo.ts).
      ...noindexHeaders(),
    ];
  },

  // Compress responses
  compress: true,

  // Strip powered-by header
  poweredByHeader: false,
};

// withSentryConfig is safe to apply unconditionally: without SENTRY_AUTH_TOKEN
// (source map upload) or NEXT_PUBLIC_SENTRY_DSN (runtime init) it's inert.
const config = withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
});

export default function nextConfigFor(phase: string) {
  // `next lint` loads the config in the build phase too, but builds nothing.
  if (phase === PHASE_PRODUCTION_BUILD && !process.argv.includes("lint")) requireSiteUrl(process.env);
  return config;
}

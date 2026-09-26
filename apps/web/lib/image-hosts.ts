/**
 * Image hosts that next/image may optimise (resize + AVIF/WebP). Shared by
 * next.config.ts (remotePatterns, CSP img-src) and components, so an image from
 * a host not listed here is still shown — just unoptimised — instead of failing.
 *
 * Add production hosts (e.g. the S3_PUBLIC_URL / CDN host) with the
 * NEXT_PUBLIC_IMAGE_HOSTS env var: comma-separated hostnames, "*." wildcards allowed.
 */
export type ImageHost = { protocol: "http" | "https"; hostname: string };

const BUILT_IN: ImageHost[] = [
  { protocol: "https", hostname: "images.unsplash.com" },
  { protocol: "https", hostname: "*.tahaif.pk" },
  { protocol: "https", hostname: "*.s3.amazonaws.com" },
  { protocol: "http", hostname: "localhost" },
  { protocol: "http", hostname: "127.0.0.1" },
];

export function imageHosts(extra: string | undefined = process.env.NEXT_PUBLIC_IMAGE_HOSTS): ImageHost[] {
  const fromEnv = (extra ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .map((hostname): ImageHost => ({ protocol: "https", hostname }));
  return [...BUILT_IN, ...fromEnv];
}

function matches(pattern: string, hostname: string): boolean {
  return pattern.startsWith("*.") ? hostname.endsWith(pattern.slice(1)) : hostname === pattern;
}

/** True when next/image can optimise this URL; false means render it with `unoptimized`. */
export function isOptimizable(src: string, hosts: ImageHost[] = imageHosts()): boolean {
  try {
    const url = new URL(src);
    // next/image won't process SVGs (dangerouslyAllowSVG is off), so serve them as-is.
    if (url.pathname.toLowerCase().endsWith(".svg")) return false;
    const protocol = url.protocol.replace(":", "");
    return hosts.some((h) => h.protocol === protocol && matches(h.hostname, url.hostname));
  } catch {
    return false; // relative or malformed: let the browser load it as-is
  }
}

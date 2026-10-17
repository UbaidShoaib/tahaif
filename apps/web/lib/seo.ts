// Search-engine rules shared by robots.ts, sitemap.ts, page metadata and the
// X-Robots-Tag headers in next.config.ts. No "@/" imports: next.config loads this file.

/**
 * Private pages that get `X-Robots-Tag: noindex`. A header covers client pages
 * that can't export metadata. Token pages (/track, /send, /note, /thanks,
 * /checkout/success) must stay crawlable so search engines can see the header.
 */
export const NOINDEX_PATHS = [
  "/account",
  "/admin",
  "/cart",
  "/checkout",
  "/forgot-password",
  "/login",
  "/note",
  "/register",
  "/reset-password",
  "/search",
  "/send",
  "/thanks",
  "/track",
  "/vendor/dashboard",
  "/vendor/orders",
  "/vendor/products",
  "/verify-email",
] as const;

/** Signed-in areas with nothing to index; robots.txt keeps crawlers out entirely. */
export const DISALLOWED_PATHS = [
  "/account/",
  "/admin/",
  "/vendor/dashboard",
  "/vendor/orders",
  "/vendor/products",
  "/api/",
] as const;

/** next.config `headers()` entries: each path and everything beneath it. */
export function noindexHeaders() {
  return NOINDEX_PATHS.map((path) => ({
    source: `${path}/:path*`,
    headers: [{ key: "X-Robots-Tag", value: "noindex" }],
  }));
}

/** Page metadata pointing search engines at the parameter-free URL of this page. */
export function canonical(path: string) {
  return { alternates: { canonical: path } };
}

/** Metadata for placeholder pages: kept out of the index until they have content. */
export const NOINDEX = { robots: { index: false, follow: true } } as const;

/**
 * The public site origin. Production builds must set NEXT_PUBLIC_SITE_URL, or every
 * canonical, sitemap and share URL would point at localhost.
 */
export function requireSiteUrl(env: Record<string, string | undefined>): string {
  const url = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be set for production builds (e.g. https://tahaif.pk); " +
        "canonical URLs, the sitemap and robots.txt are built from it.",
    );
  }
  return url;
}

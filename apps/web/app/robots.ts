import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { ALLOWED_PATHS, DISALLOWED_PATHS } from "@/lib/seo";

// /_next/ stays crawlable: Googlebot needs the JS and CSS to render pages.
// Private pages are kept out of the index by X-Robots-Tag (lib/seo.ts), not here.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: [...ALLOWED_PATHS], disallow: [...DISALLOWED_PATHS] }],
    sitemap: `${brand.siteUrl}/sitemap.xml`,
  };
}

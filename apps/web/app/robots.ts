import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tahaif.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/checkout/",
          "/account/",
          "/api/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

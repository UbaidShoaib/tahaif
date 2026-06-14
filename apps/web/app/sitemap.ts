import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tahaif.com";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const resp = await fetch(`${API_URL}${path}`, { next: { revalidate: 3600 } });
    if (!resp.ok) return null;
    return resp.json() as Promise<T>;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/search`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/login`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/register`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/blog`, changeFrequency: "weekly", priority: 0.6 },
  ];

  // Product pages
  const products = await fetchJson<Array<{ slug: string; updated_at?: string }>>(
    "/products?page_size=500&active_only=true"
  );
  const productUrls: MetadataRoute.Sitemap =
    (products as Array<{ slug: string; updated_at?: string }> | null)?.map?.((p) => ({
      url: `${BASE_URL}/p/${p.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
    })) ?? [];

  // Category pages
  const categories = await fetchJson<Array<{ slug: string }>>(
    "/categories"
  );
  const categoryUrls: MetadataRoute.Sitemap =
    (categories as Array<{ slug: string }> | null)?.map?.((c) => ({
      url: `${BASE_URL}/c/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })) ?? [];

  return [...staticRoutes, ...productUrls, ...categoryUrls];
}

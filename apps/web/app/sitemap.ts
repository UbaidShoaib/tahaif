import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { catalogApi, type Category, type Product } from "@/lib/catalog";

// Built per request from hour-cached API data. An API failure fails the request
// (search engines retry) rather than publishing a sitemap with no products.
export const dynamic = "force-dynamic";

const BASE_URL = brand.siteUrl;
/** The API's page_size limit for /products. */
const PAGE_SIZE = 100;
/** One sitemap file holds 50,000 URLs; split with generateSitemaps before this is reached. */
const MAX_PAGES = 400;

// Only pages with real content. Stubs (FAQ, blog, privacy, refund) join once written.
const STATIC_PATHS: { path: string; changeFrequency: "daily" | "monthly"; priority: number }[] = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.4 },
  { path: "/sell", changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.2 },
];

async function allProducts(): Promise<Product[]> {
  const products: Product[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { items, total } = await catalogApi.getProducts({ page, page_size: PAGE_SIZE });
    products.push(...items);
    if (items.length < PAGE_SIZE || products.length >= total) break;
  }
  return products;
}

function flatten(categories: Category[]): Category[] {
  return categories.flatMap((c) => [c, ...flatten(c.children)]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, occasions, vendors] = await Promise.all([
    allProducts(),
    catalogApi.getCategories(),
    catalogApi.getOccasions(),
    catalogApi.getVendors(),
  ]);

  return [
    ...STATIC_PATHS.map(({ path, changeFrequency, priority }) => ({
      url: `${BASE_URL}${path}`,
      changeFrequency,
      priority,
    })),
    ...flatten(categories)
      .filter((c) => c.is_active)
      .map((c) => ({ url: `${BASE_URL}/c/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...occasions.map((o) => ({
      url: `${BASE_URL}/occasion/${o.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...products.map((p) => ({
      url: `${BASE_URL}/p/${p.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
      ...(p.updated_at && { lastModified: new Date(p.updated_at) }),
    })),
    ...vendors
      .filter((v) => v.is_active)
      .map((v) => ({ url: `${BASE_URL}/vendor/${v.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}

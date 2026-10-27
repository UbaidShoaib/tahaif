import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { catalogApi, type Category } from "@/lib/catalog";
import { countByCity, listAllProducts, MIN_CITY_PRODUCTS } from "@/lib/city-seo";

// Built per request from hour-cached API data. An API failure fails the request
// (search engines retry) rather than publishing a sitemap with no products.
export const dynamic = "force-dynamic";

const BASE_URL = brand.siteUrl;

// Only pages with real content. Stubs (FAQ, blog, privacy, refund) join once written.
const STATIC_PATHS: { path: string; changeFrequency: "daily" | "monthly"; priority: number }[] = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.4 },
  { path: "/sell", changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.2 },
];

function flatten(categories: Category[]): Category[] {
  return categories.flatMap((c) => [c, ...flatten(c.children)]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, occasions, vendors, cities] = await Promise.all([
    listAllProducts(),
    catalogApi.getCategories(),
    catalogApi.getOccasions(),
    catalogApi.getVendors(),
    catalogApi.getCities(),
  ]);
  const activeCategories = flatten(categories).filter((c) => c.is_active);
  const { byCity, byCategoryCity } = countByCity(products);
  const activeCities = cities.filter((c) => c.is_active);

  return [
    ...STATIC_PATHS.map(({ path, changeFrequency, priority }) => ({
      url: `${BASE_URL}${path}`,
      changeFrequency,
      priority,
    })),
    ...activeCategories.map((c) => ({ url: `${BASE_URL}/c/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    // City pages, only where they have something to show (the same rule as their robots meta).
    ...activeCities
      .filter((city) => (byCity.get(city.id) ?? 0) > 0)
      .map((city) => ({ url: `${BASE_URL}/city/${city.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...activeCategories.flatMap((c) =>
      activeCities
        .filter((city) => (byCategoryCity.get(`${c.id}:${city.id}`) ?? 0) >= MIN_CITY_PRODUCTS)
        .map((city) => ({
          url: `${BASE_URL}/c/${c.slug}/${city.slug}`,
          changeFrequency: "weekly" as const,
          priority: 0.7,
        })),
    ),
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

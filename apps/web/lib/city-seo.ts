// City landing pages for search: /city/{city} and /c/{category}/{city}.
// People search "flowers gujranwala" or "cake delivery lahore", so each city
// and each category in a city gets its own indexable page (docs/phases/phase-10-seo.md §3).
import { catalogApi, type City, type Product } from "@/lib/catalog";

/**
 * A category-in-a-city page is indexed only with at least this many gifts;
 * thinner pages still work for buyers but stay out of search results.
 */
export const MIN_CITY_PRODUCTS = 3;

/** The API's page_size limit for /products. */
const PAGE_SIZE = 100;
/** Stop after this many pages (40,000 products), well inside one sitemap file. */
const MAX_PAGES = 400;

/** Every live product, optionally only those delivered in one city. */
export async function listAllProducts(params: { city_id?: string } = {}): Promise<Product[]> {
  const products: Product[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { items, total } = await catalogApi.getProducts({ ...params, page, page_size: PAGE_SIZE });
    products.push(...items);
    if (items.length < PAGE_SIZE || products.length >= total) break;
  }
  return products;
}

/** Cities a product can be delivered to (the API's rule for ?city_id=). */
function deliveredIn(product: Product): string[] {
  return product.product_cities.filter((pc) => pc.is_available).map((pc) => pc.city_id);
}

/** How many gifts each city has, overall and per category. Keys: city id, and `${categoryId}:${cityId}`. */
export function countByCity(products: Product[]) {
  const byCity = new Map<string, number>();
  const byCategoryCity = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const product of products) {
    for (const cityId of deliveredIn(product)) {
      bump(byCity, cityId);
      if (product.category_id) bump(byCategoryCity, `${product.category_id}:${cityId}`);
    }
  }
  return { byCity, byCategoryCity };
}

/** A city by its URL slug, or null when it doesn't exist or isn't active. */
export async function getCityBySlug(slug: string): Promise<City | null> {
  const cities = await catalogApi.getCities();
  return cities.find((c) => c.slug === slug && c.is_active) ?? null;
}

/** Number of live gifts matching a filter, from a one-item page. */
export async function countProducts(params: { city_id: string; category_id?: string }): Promise<number> {
  return (await catalogApi.getProducts({ ...params, page_size: 1 })).total;
}

/** "12 gifts from local shops"; no number when there are none yet. */
const gifts = (n: number) => (n > 0 ? `${n} ${n === 1 ? "gift" : "gifts"} from local shops` : "Gifts from local shops");

// Titles lead with the words people search: "{category} delivery in {city}".
export const cityCopy = {
  hubTitle: (city: string) => `Gift Delivery in ${city} — Send Cakes, Flowers & Gifts Online`,
  hubHeading: (city: string) => `Gift delivery in ${city}`,
  hubDescription: (city: string, count: number) =>
    `Send cakes, flowers, mithai and gifts to ${city}. ${gifts(count)}, delivered to the door ` +
    `with your card message. Cash on delivery or bank transfer.`,

  categoryTitle: (category: string, city: string) => `${category} Delivery in ${city} — Order ${category} Online`,
  categoryHeading: (category: string, city: string) => `${category} delivery in ${city}`,
  categoryDescription: (category: string, city: string, count: number) =>
    `Order ${category.toLowerCase()} online for delivery in ${city}. ${gifts(count)}, ` +
    `with a printed card message. Cash on delivery or bank transfer.`,

  nationalTitle: (category: string) => `${category} Delivery Across Pakistan — Order ${category} Online`,
  nationalDescription: (category: string) =>
    `Send ${category.toLowerCase()} to your loved ones in Karachi, Lahore, Islamabad, Gujranwala and across ` +
    `Pakistan. Choose the city, add a card message, pay cash on delivery.`,

  vendorTitle: (vendor: string, city?: string) =>
    city ? `${vendor}, ${city} — Order Online for Home Delivery` : vendor,
  vendorDescription: (vendor: string, city: string | undefined, about: string | null) =>
    [city ? `Order from ${vendor} in ${city} for home delivery.` : `Order from ${vendor} for home delivery.`, about]
      .filter(Boolean)
      .join(" "),
};

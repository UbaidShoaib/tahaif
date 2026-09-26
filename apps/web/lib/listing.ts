import type { PaginatedProducts, Product } from "@/lib/catalog";

export type ListingSort = "recommended" | "price_asc" | "price_desc" | "newest";

export const SORT_OPTIONS: { value: ListingSort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
];

/** Price bands in paisa. Bands keep the URL short and the choice quick on a phone. */
export const PRICE_BANDS: { id: string; label: string; min?: number; max?: number }[] = [
  { id: "under-2000", label: "Under Rs 2,000", max: 200_000 },
  { id: "2000-5000", label: "Rs 2,000 – 5,000", min: 200_000, max: 500_000 },
  { id: "5000-10000", label: "Rs 5,000 – 10,000", min: 500_000, max: 1_000_000 },
  { id: "over-10000", label: "Over Rs 10,000", min: 1_000_000 },
];

export const PAGE_SIZE = 24;
/** /search isn't paginated server-side; we fetch this many matches and page through them locally. */
const SEARCH_LIMIT = 100;

/** Filters that live in the URL (?q=&city_id=&sort=&price=). */
export type ListingParams = {
  q: string;
  cityId: string;
  sort: ListingSort;
  price: string;
};

/** Fixed scope of a listing page, not user-editable (e.g. the category being viewed). */
export type ListingScope = {
  category_id?: string;
  occasion_id?: string;
  vendor_id?: string;
};

type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

function read(sp: SearchParamsLike, key: string): string {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? "";
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseListingParams(sp: SearchParamsLike): ListingParams {
  const sort = read(sp, "sort");
  const price = read(sp, "price");
  return {
    q: read(sp, "q").trim(),
    cityId: read(sp, "city_id"),
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as ListingSort) : "recommended",
    price: PRICE_BANDS.some((b) => b.id === price) ? price : "",
  };
}

/** Query string for the page URL; defaults are left out so URLs stay clean. */
export function listingQueryString(p: ListingParams): string {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.cityId) qs.set("city_id", p.cityId);
  if (p.sort !== "recommended") qs.set("sort", p.sort);
  if (p.price) qs.set("price", p.price);
  return qs.toString();
}

export function activeFilterCount(p: ListingParams): number {
  return (p.cityId ? 1 : 0) + (p.price ? 1 : 0);
}

export function apiBase(): string {
  const pub = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  return typeof window === "undefined" ? (process.env.API_INTERNAL_URL ?? pub) : pub;
}

/**
 * Price used for filtering and sorting: the chosen city's price, or the base
 * price when no city is chosen. Mirrors the API's rule for /products.
 */
export function effectivePrice(product: Product, cityId?: string): number {
  const pc = cityId ? product.product_cities.find((c) => c.city_id === cityId) : undefined;
  return pc?.price_override_pkr ?? product.base_price_pkr;
}

function inBand(price: number, bandId: string): boolean {
  const band = PRICE_BANDS.find((b) => b.id === bandId);
  if (!band) return true;
  return (band.min === undefined || price >= band.min) && (band.max === undefined || price <= band.max);
}

async function getJson<T>(url: string): Promise<T> {
  // Catalogue data is public: no cookies, so it works with any CORS setup and caches well.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

/**
 * One page of results. Browsing uses /products (sorted and filtered by the
 * API). Text search uses /search, which returns relevance-ranked matches
 * without paging, so price filtering, sorting and paging happen here on up
 * to SEARCH_LIMIT matches ("recommended" keeps relevance order).
 */
export async function fetchListing(
  scope: ListingScope,
  p: ListingParams,
  page: number,
): Promise<PaginatedProducts> {
  const base = apiBase();

  if (p.q) {
    const qs = new URLSearchParams({ q: p.q, limit: String(SEARCH_LIMIT) });
    if (p.cityId) qs.set("city_id", p.cityId);
    const data = await getJson<PaginatedProducts>(`${base}/search?${qs.toString()}`);
    let items = data.items.filter((prod) => inBand(effectivePrice(prod, p.cityId), p.price));
    if (p.sort === "price_asc" || p.sort === "price_desc") {
      const dir = p.sort === "price_asc" ? 1 : -1;
      items = [...items].sort((a, b) => dir * (effectivePrice(a, p.cityId) - effectivePrice(b, p.cityId)));
    }
    const start = (page - 1) * PAGE_SIZE;
    return { items: items.slice(start, start + PAGE_SIZE), total: items.length, page, page_size: PAGE_SIZE };
  }

  const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  for (const [k, v] of Object.entries(scope)) if (v) qs.set(k, v);
  if (p.cityId) qs.set("city_id", p.cityId);
  if (p.sort !== "recommended") qs.set("sort", p.sort);
  const band = PRICE_BANDS.find((b) => b.id === p.price);
  if (band?.min !== undefined) qs.set("min_price_pkr", String(band.min));
  if (band?.max !== undefined) qs.set("max_price_pkr", String(band.max));
  return getJson<PaginatedProducts>(`${base}/products?${qs.toString()}`);
}

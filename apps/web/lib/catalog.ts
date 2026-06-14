// Server-safe catalog fetch helpers for Next.js server components.
// Uses NEXT_PUBLIC_API_URL so it works in both server and client contexts in dev.
const API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000/api/v1";

export type ProductImage = {
  id: string;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

export type ProductCity = {
  city_id: string;
  price_override_pkr: number | null;
  delivery_fee_pkr: number;
  lead_time_hours: number;
  same_day_cutoff: string | null;
  is_available: boolean;
};

export type ProductVariant = {
  id: string;
  name: string;
  price_delta_pkr: number;
  stock_qty: number;
  attrs: Record<string, unknown> | null;
  is_active: boolean;
};

export type VendorSummary = {
  id: string;
  name: string;
  slug: string;
};

export type Product = {
  id: string;
  vendor_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  base_price_pkr: number;
  is_active: boolean;
  images: ProductImage[];
  product_cities: ProductCity[];
  variants: ProductVariant[];
  vendor: VendorSummary | null;
};

export type PaginatedProducts = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
};

export type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  children: Category[];
};

export type Vendor = {
  id: string;
  city_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
};

export type City = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  is_active: boolean;
};

export type Occasion = {
  id: string;
  slug: string;
  name: string;
  name_ur: string | null;
  banner_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  is_active: boolean;
};

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`API ${res.status} — ${path}`);
  return res.json() as Promise<T>;
}

export const catalogApi = {
  getCategories: () => apiFetch<Category[]>("/categories"),

  getCities: () => apiFetch<City[]>("/cities"),

  getProducts: (params?: {
    category_id?: string;
    vendor_id?: string;
    city_id?: string;
    occasion_id?: string;
    page?: number;
    page_size?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.category_id) qs.set("category_id", params.category_id);
    if (params?.vendor_id) qs.set("vendor_id", params.vendor_id);
    if (params?.city_id) qs.set("city_id", params.city_id);
    if (params?.occasion_id) qs.set("occasion_id", params.occasion_id);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.page_size) qs.set("page_size", String(params.page_size));
    const query = qs.toString();
    return apiFetch<PaginatedProducts>(`/products${query ? `?${query}` : ""}`);
  },

  getProduct: (slug: string) => apiFetch<Product>(`/products/${slug}`),

  getVendor: (slug: string) => apiFetch<Vendor>(`/vendors/${slug}`),

  getOccasions: () => apiFetch<Occasion[]>("/occasions"),

  getOccasion: (slug: string) => apiFetch<Occasion>(`/occasions/${slug}`),

  getCategoryBySlug: async (slug: string): Promise<Category | null> => {
    const all = await catalogApi.getCategories();
    const flat = (cats: Category[]): Category[] =>
      cats.flatMap((c) => [c, ...flat(c.children)]);
    return flat(all).find((c) => c.slug === slug) ?? null;
  },
};

export function primaryImage(product: Product): string {
  const primary = product.images.find((i) => i.is_primary);
  return (
    primary?.url ??
    product.images[0]?.url ??
    "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800"
  );
}

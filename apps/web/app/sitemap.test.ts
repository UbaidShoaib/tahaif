import { describe, it, expect, vi, beforeEach } from "vitest";
import sitemap from "@/app/sitemap";
import { brand } from "@/lib/brand";
import { catalogApi, type Category, type Product, type Vendor } from "@/lib/catalog";
import type * as CatalogModule from "@/lib/catalog";

vi.mock("@/lib/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof CatalogModule>();
  return {
    ...actual,
    catalogApi: {
      ...actual.catalogApi,
      getProducts: vi.fn(),
      getCategories: vi.fn(),
      getOccasions: vi.fn(),
      getVendors: vi.fn(),
      getCities: vi.fn(),
    },
  };
});

const prod = (slug: string, updated_at?: string, category_id: string | null = null, cityIds: string[] = []): Product => ({
  id: slug, vendor_id: "v", category_id, name: slug, slug, description: null, base_price_pkr: 1,
  is_active: true, images: [], variants: [], vendor: null, updated_at,
  product_cities: cityIds.map((city_id) => ({
    city_id, price_override_pkr: null, delivery_fee_pkr: 0, lead_time_hours: 0, same_day_cutoff: null, is_available: true,
  })),
});
const city = (slug: string) => ({ id: slug, name: slug, slug, timezone: "Asia/Karachi", is_active: true });
const cat = (slug: string, children: Category[] = [], is_active = true): Category => ({
  id: slug, parent_id: null, name: slug, slug, sort_order: 0, is_active, children,
});
const vendor = (slug: string, is_active = true): Vendor => ({
  id: slug, city_id: "c", name: slug, slug, description: null, logo_url: null, is_active,
});

const urls = async () => (await sitemap()).map((e) => e.url.replace(brand.siteUrl, ""));

beforeEach(() => {
  vi.mocked(catalogApi.getProducts).mockReset();
  vi.mocked(catalogApi.getCategories).mockResolvedValue([]);
  vi.mocked(catalogApi.getOccasions).mockResolvedValue([]);
  vi.mocked(catalogApi.getVendors).mockResolvedValue([]);
  vi.mocked(catalogApi.getCities).mockResolvedValue([]);
});

describe("sitemap", () => {
  it("pages through every product within the API's page size limit", async () => {
    const first = Array.from({ length: 100 }, (_, i) => prod(`p${i}`));
    vi.mocked(catalogApi.getProducts)
      .mockResolvedValueOnce({ items: first, total: 101, page: 1, page_size: 100 })
      .mockResolvedValueOnce({ items: [prod("last")], total: 101, page: 2, page_size: 100 });

    const all = await urls();

    expect(catalogApi.getProducts).toHaveBeenNthCalledWith(1, { page: 1, page_size: 100 });
    expect(catalogApi.getProducts).toHaveBeenNthCalledWith(2, { page: 2, page_size: 100 });
    expect(all.filter((u) => u.startsWith("/p/"))).toHaveLength(101);
    expect(all).toContain("/p/last");
  });

  it("dates products by their last update", async () => {
    vi.mocked(catalogApi.getProducts).mockResolvedValue({
      items: [prod("cake", "2026-10-01T10:00:00Z")], total: 1, page: 1, page_size: 100,
    });
    const entry = (await sitemap()).find((e) => e.url.endsWith("/p/cake"));
    expect(entry?.lastModified).toEqual(new Date("2026-10-01T10:00:00Z"));
  });

  it("lists active categories with subcategories, occasions and active shops", async () => {
    vi.mocked(catalogApi.getProducts).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
    vi.mocked(catalogApi.getCategories).mockResolvedValue([
      cat("cakes", [cat("birthday-cakes"), cat("old-cakes", [], false)]),
    ]);
    vi.mocked(catalogApi.getOccasions).mockResolvedValue([
      { id: "o", slug: "eid-ul-fitr", name: "Eid", name_ur: null, banner_url: null, starts_at: null, ends_at: null, sort_order: 0, is_active: true },
    ]);
    vi.mocked(catalogApi.getVendors).mockResolvedValue([vendor("sweet-bakery"), vendor("closed-shop", false)]);

    const all = await urls();

    expect(all).toEqual(
      expect.arrayContaining(["/c/cakes", "/c/birthday-cakes", "/occasion/eid-ul-fitr", "/vendor/sweet-bakery"]),
    );
    expect(all).not.toContain("/c/old-cakes");
    expect(all).not.toContain("/vendor/closed-shop");
  });

  it("lists city pages that have gifts, and a category in a city only with enough of them", async () => {
    vi.mocked(catalogApi.getCategories).mockResolvedValue([cat("flowers"), cat("cakes")]);
    vi.mocked(catalogApi.getCities).mockResolvedValue([city("gujranwala"), city("lahore"), city("multan")]);
    vi.mocked(catalogApi.getProducts).mockResolvedValue({
      items: [
        prod("roses", undefined, "flowers", ["gujranwala", "lahore"]),
        prod("tulips", undefined, "flowers", ["gujranwala"]),
        prod("lilies", undefined, "flowers", ["gujranwala"]),
        prod("fudge", undefined, "cakes", ["gujranwala"]),
      ],
      total: 4, page: 1, page_size: 100,
    });

    const all = await urls();

    expect(all).toEqual(expect.arrayContaining(["/city/gujranwala", "/city/lahore", "/c/flowers/gujranwala"]));
    expect(all).not.toContain("/city/multan"); // nothing delivers there
    expect(all).not.toContain("/c/flowers/lahore"); // 1 gift: below the threshold
    expect(all).not.toContain("/c/cakes/gujranwala");
  });

  it("leaves out missing, private and placeholder pages", async () => {
    vi.mocked(catalogApi.getProducts).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 });
    const all = await urls();
    expect(all).toContain("");
    for (const path of ["/about", "/login", "/register", "/search", "/blog", "/faq"]) {
      expect(all).not.toContain(path);
    }
  });

  it("fails rather than publishing a sitemap without products when the API is down", async () => {
    vi.mocked(catalogApi.getProducts).mockRejectedValue(new Error("API 503"));
    await expect(sitemap()).rejects.toThrow("API 503");
  });
});

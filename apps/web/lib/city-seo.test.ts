import { describe, it, expect, vi, beforeEach } from "vitest";
import { catalogApi, type Product } from "@/lib/catalog";
import type * as CatalogModule from "@/lib/catalog";
import { cityCopy, countByCity, getCityBySlug, listAllProducts } from "@/lib/city-seo";

vi.mock("@/lib/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof CatalogModule>();
  return { ...actual, catalogApi: { ...actual.catalogApi, getProducts: vi.fn(), getCities: vi.fn() } };
});

const deliversTo = (cityId: string, is_available = true) => ({
  city_id: cityId, price_override_pkr: null, delivery_fee_pkr: 0, lead_time_hours: 0, same_day_cutoff: null, is_available,
});
const prod = (slug: string, category_id: string | null, cities: ReturnType<typeof deliversTo>[]): Product => ({
  id: slug, vendor_id: "v", category_id, name: slug, slug, description: null, base_price_pkr: 1,
  is_active: true, images: [], product_cities: cities, variants: [], vendor: null,
});

beforeEach(() => vi.mocked(catalogApi.getProducts).mockReset());

describe("countByCity", () => {
  it("counts gifts per city and per category in a city, skipping unavailable cities", () => {
    const { byCity, byCategoryCity } = countByCity([
      prod("roses", "flowers", [deliversTo("gujranwala"), deliversTo("lahore")]),
      prod("tulips", "flowers", [deliversTo("gujranwala"), deliversTo("karachi", false)]),
      prod("fudge", "cakes", [deliversTo("gujranwala")]),
      prod("hamper", null, [deliversTo("lahore")]),
    ]);
    expect(byCity.get("gujranwala")).toBe(3);
    expect(byCity.get("lahore")).toBe(2);
    expect(byCity.has("karachi")).toBe(false);
    expect(byCategoryCity.get("flowers:gujranwala")).toBe(2);
    expect(byCategoryCity.get("cakes:gujranwala")).toBe(1);
    expect(byCategoryCity.get("flowers:lahore")).toBe(1);
  });
});

describe("listAllProducts", () => {
  it("pages through one city's products at the API's page size", async () => {
    vi.mocked(catalogApi.getProducts)
      .mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, i) => prod(`p${i}`, null, [])), total: 101, page: 1, page_size: 100 })
      .mockResolvedValueOnce({ items: [prod("last", null, [])], total: 101, page: 2, page_size: 100 });
    expect(await listAllProducts({ city_id: "gujranwala" })).toHaveLength(101);
    expect(catalogApi.getProducts).toHaveBeenLastCalledWith({ city_id: "gujranwala", page: 2, page_size: 100 });
  });
});

describe("getCityBySlug", () => {
  it("finds active cities only", async () => {
    vi.mocked(catalogApi.getCities).mockResolvedValue([
      { id: "g", name: "Gujranwala", slug: "gujranwala", timezone: "Asia/Karachi", is_active: true },
      { id: "x", name: "Closed", slug: "closed", timezone: "Asia/Karachi", is_active: false },
    ]);
    expect((await getCityBySlug("gujranwala"))?.name).toBe("Gujranwala");
    expect(await getCityBySlug("closed")).toBeNull();
    expect(await getCityBySlug("nowhere")).toBeNull();
  });
});

describe("cityCopy", () => {
  it("puts the searched words first: what, then where", () => {
    expect(cityCopy.categoryTitle("Flowers", "Gujranwala")).toBe("Flowers Delivery in Gujranwala — Order Flowers Online");
    expect(cityCopy.hubTitle("Gujranwala")).toMatch(/^Gift Delivery in Gujranwala/);
    expect(cityCopy.vendorTitle("Bouquet Bar", "Gujranwala")).toMatch(/^Bouquet Bar, Gujranwala/);
    expect(cityCopy.vendorTitle("Bouquet Bar")).toBe("Bouquet Bar");
  });

  it("states the real number of gifts", () => {
    expect(cityCopy.categoryDescription("Cakes", "Lahore", 1)).toContain("1 gift from local shops");
    expect(cityCopy.hubDescription("Lahore", 12)).toContain("12 gifts");
    expect(cityCopy.hubDescription("Gujranwala", 0)).not.toMatch(/\b0 gifts/);
  });
});

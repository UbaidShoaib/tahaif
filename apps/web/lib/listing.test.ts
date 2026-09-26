import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchListing, listingQueryString, parseListingParams, activeFilterCount } from "@/lib/listing";
import type { Product } from "@/lib/catalog";

const prod = (id: string, price: number, override?: number): Product => ({
  id, vendor_id: "v", category_id: null, name: id, slug: id, description: null, base_price_pkr: price,
  is_active: true, images: [], variants: [], vendor: null,
  product_cities: [{ city_id: "lhr", price_override_pkr: override ?? null, delivery_fee_pkr: 0, lead_time_hours: 24, same_day_cutoff: null, is_available: true }],
});

function mockFetch(body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("listing params", () => {
  it("parses known values and ignores junk", () => {
    expect(parseListingParams(new URLSearchParams("q=+roses+&sort=price_asc&price=2000-5000&city_id=lhr"))).toEqual({
      q: "roses", sort: "price_asc", price: "2000-5000", cityId: "lhr",
    });
    expect(parseListingParams({ sort: "cheapest", price: "free" })).toMatchObject({ sort: "recommended", price: "" });
  });

  it("leaves defaults out of the URL", () => {
    expect(listingQueryString({ q: "", cityId: "", sort: "recommended", price: "" })).toBe("");
    expect(listingQueryString({ q: "cake", cityId: "lhr", sort: "newest", price: "under-2000" })).toBe(
      "q=cake&city_id=lhr&sort=newest&price=under-2000",
    );
  });

  it("counts active filters (not search or sort)", () => {
    expect(activeFilterCount({ q: "x", cityId: "lhr", sort: "newest", price: "" })).toBe(1);
  });
});

describe("fetchListing", () => {
  it("asks the API to sort and filter when browsing", async () => {
    const fetchFn = mockFetch({ items: [], total: 0, page: 2, page_size: 24 });
    await fetchListing({ category_id: "cakes" }, { q: "", cityId: "lhr", sort: "price_desc", price: "2000-5000" }, 2);
    const url = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(url.pathname).toMatch(/\/products$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2", page_size: "24", category_id: "cakes", city_id: "lhr", sort: "price_desc",
      min_price_pkr: "200000", max_price_pkr: "500000",
    });
  });

  it("filters, sorts and pages search results locally using the city price", async () => {
    mockFetch({ items: [prod("a", 300_000), prod("b", 900_000, 150_000), prod("c", 100_000), prod("d", 700_000)], total: 4, page: 1, page_size: 100 });
    const res = await fetchListing({}, { q: "cake", cityId: "lhr", sort: "price_asc", price: "under-2000" }, 1);
    // b costs Rs 1,500 in Lahore thanks to its override; a (Rs 3,000) and d are over the band.
    expect(res.items.map((p) => p.id)).toEqual(["c", "b"]);
    expect(res.total).toBe(2);
  });

  it("keeps relevance order for recommended search results", async () => {
    mockFetch({ items: [prod("z", 1), prod("a", 2)], total: 2, page: 1, page_size: 100 });
    const res = await fetchListing({}, { q: "x", cityId: "", sort: "recommended", price: "" }, 1);
    expect(res.items.map((p) => p.id)).toEqual(["z", "a"]);
  });

  it("throws on API errors so the page can show a retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchListing({}, { q: "", cityId: "", sort: "recommended", price: "" }, 1)).rejects.toThrow();
  });
});

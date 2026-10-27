import { describe, it, expect, vi, beforeEach } from "vitest";
import CategoryPage, { generateMetadata } from "@/app/c/[...slug]/page";
import { catalogApi } from "@/lib/catalog";
import type * as CatalogModule from "@/lib/catalog";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof CatalogModule>();
  return {
    ...actual,
    catalogApi: { ...actual.catalogApi, getCategoryBySlug: vi.fn(), getCities: vi.fn(), getProducts: vi.fn() },
  };
});

const props = (slug: string[], searchParams: Record<string, string> = {}) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve(searchParams),
});
const flowers = { id: "c1", parent_id: null, name: "Flowers", slug: "flowers", sort_order: 0, is_active: true, children: [] };
const gujranwala = { id: "g", name: "Gujranwala", slug: "gujranwala", timezone: "Asia/Karachi", is_active: true };
const withCount = (total: number) =>
  vi.mocked(catalogApi.getProducts).mockResolvedValue({ items: [], total, page: 1, page_size: 1 });

beforeEach(() => {
  vi.mocked(catalogApi.getCategoryBySlug).mockResolvedValue(flowers);
  vi.mocked(catalogApi.getCities).mockResolvedValue([gujranwala]);
});

describe("CategoryPage", () => {
  it("is not found when the second segment isn't a city, so it can't be duplicated", async () => {
    await expect(CategoryPage(props(["flowers", "anything"]))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(CategoryPage(props(["flowers", "gujranwala", "x"]))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata(props(["flowers", "anything"]))).toEqual({ title: "Category Not Found" });
  });

  it("points filtered listings at the plain category URL, titled for a national search", async () => {
    const meta = await generateMetadata(props(["flowers"], { sort: "price_asc", price: "under-2000" }));
    expect(meta.alternates?.canonical).toBe("/c/flowers");
    expect(meta.title).toBe("Flowers Delivery Across Pakistan — Order Flowers Online");
  });

  it("gives a category in a city its own indexable page", async () => {
    withCount(8);
    const meta = await generateMetadata(props(["flowers", "gujranwala"]));
    expect(meta.title).toBe("Flowers Delivery in Gujranwala — Order Flowers Online");
    expect(meta.description).toContain("8 gifts");
    expect(meta.alternates?.canonical).toBe("/c/flowers/gujranwala");
    expect(meta.robots).toBeUndefined();
    expect(catalogApi.getProducts).toHaveBeenCalledWith({ category_id: "c1", city_id: "g", page_size: 1 });
  });

  it("keeps a city page with too few gifts out of search results", async () => {
    withCount(2);
    const meta = await generateMetadata(props(["flowers", "gujranwala"]));
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});

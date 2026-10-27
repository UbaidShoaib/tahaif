import { describe, it, expect, vi, beforeEach } from "vitest";
import CityPage, { generateMetadata } from "@/app/city/[city]/page";
import { catalogApi } from "@/lib/catalog";
import type * as CatalogModule from "@/lib/catalog";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof CatalogModule>();
  return { ...actual, catalogApi: { ...actual.catalogApi, getCities: vi.fn(), getProducts: vi.fn() } };
});

const props = (city: string) => ({ params: Promise.resolve({ city }), searchParams: Promise.resolve({}) });
const withCount = (total: number) =>
  vi.mocked(catalogApi.getProducts).mockResolvedValue({ items: [], total, page: 1, page_size: 1 });

beforeEach(() => {
  vi.mocked(catalogApi.getCities).mockResolvedValue([
    { id: "g", name: "Gujranwala", slug: "gujranwala", timezone: "Asia/Karachi", is_active: true },
  ]);
});

describe("CityPage", () => {
  it("is not found for a city we don't deliver to", async () => {
    await expect(CityPage(props("atlantis"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata(props("atlantis"))).toEqual({ title: "City Not Found" });
  });

  it("is titled and described for searches like 'gift delivery gujranwala'", async () => {
    withCount(14);
    const meta = await generateMetadata(props("gujranwala"));
    expect(meta.title).toBe("Gift Delivery in Gujranwala — Send Cakes, Flowers & Gifts Online");
    expect(meta.description).toContain("14 gifts");
    expect(meta.alternates?.canonical).toBe("/city/gujranwala");
    expect(meta.robots).toBeUndefined();
  });

  it("stays out of search results until something delivers there", async () => {
    withCount(0);
    expect((await generateMetadata(props("gujranwala"))).robots).toEqual({ index: false, follow: true });
  });
});

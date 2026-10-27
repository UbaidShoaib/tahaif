import { describe, it, expect, vi } from "vitest";
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
  return { ...actual, catalogApi: { ...actual.catalogApi, getCategoryBySlug: vi.fn() } };
});

const props = (slug: string[], searchParams: Record<string, string> = {}) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve(searchParams),
});
const cakes = { id: "c1", parent_id: null, name: "Cakes", slug: "cakes", sort_order: 0, is_active: true, children: [] };

describe("CategoryPage", () => {
  it("is not found under extra path segments, so it can't be duplicated", async () => {
    vi.mocked(catalogApi.getCategoryBySlug).mockResolvedValue(cakes);
    await expect(CategoryPage(props(["cakes", "anything"]))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata(props(["cakes", "anything"]))).toEqual({ title: "Category Not Found" });
  });

  it("points filtered listings at the plain category URL", async () => {
    vi.mocked(catalogApi.getCategoryBySlug).mockResolvedValue(cakes);
    const meta = await generateMetadata(props(["cakes"], { sort: "price_asc", price: "under-2000" }));
    expect(meta.alternates?.canonical).toBe("/c/cakes");
  });
});

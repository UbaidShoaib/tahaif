import { describe, it, expect } from "vitest";
import { categoryPhotos } from "@/lib/home";
import type { Category, Product } from "@/lib/catalog";

const cat = (id: string, slug: string, children: Category[] = []): Category => ({
  id, parent_id: null, name: slug, slug, sort_order: 0, is_active: true, children,
});
const prod = (id: string, categoryId: string, url?: string): Product => ({
  id, vendor_id: "v", category_id: categoryId, name: id, slug: id, description: null, base_price_pkr: 1,
  is_active: true, variants: [], vendor: null, product_cities: [],
  images: url ? [{ id: `i-${id}`, url, alt_text: null, sort_order: 0, is_primary: true }] : [],
});

describe("categoryPhotos", () => {
  it("uses a photo from the category or its subcategories", () => {
    const cats = [cat("c1", "cakes", [cat("c1a", "birthday-cakes")]), cat("c2", "flowers")];
    const photos = categoryPhotos(cats, [prod("p1", "c1a", "https://x/cake.jpg"), prod("p2", "c2", "https://x/rose.jpg")]);
    expect(photos).toEqual({ cakes: "https://x/cake.jpg", flowers: "https://x/rose.jpg" });
  });

  it("leaves out categories with no photographed product", () => {
    expect(categoryPhotos([cat("c1", "mithai")], [prod("p1", "c1")])).toEqual({});
  });
});

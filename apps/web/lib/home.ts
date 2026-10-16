import { primaryImage, type Category, type Product } from "@/lib/catalog";

/**
 * A real product photo for each top-level category, taken from products in it
 * or any of its subcategories. Categories with no photographed product are
 * left out, so the page can fall back to a plain tile.
 */
export function categoryPhotos(categories: Category[], products: Product[]): Record<string, string> {
  const photos: Record<string, string> = {};
  for (const top of categories) {
    const ids = new Set<string>();
    const walk = (c: Category) => {
      ids.add(c.id);
      c.children.forEach(walk);
    };
    walk(top);
    const match = products.find((p) => p.category_id && ids.has(p.category_id) && p.images.length > 0);
    if (match) photos[top.slug] = primaryImage(match);
  }
  return photos;
}

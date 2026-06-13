import { ProductCard } from "@/components/catalog/ProductCard";
import type { Product } from "@/lib/catalog";

type Props = {
  products: Product[];
  cityId?: string;
  emptyMessage?: string;
};

export function ProductGrid({ products, cityId, emptyMessage = "No products found." }: Props) {
  if (products.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <p className="text-lg">😔</p>
        <p className="mt-2">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} cityId={cityId} />
      ))}
    </div>
  );
}

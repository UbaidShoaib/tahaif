import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
      <EmptyState
        icon={SearchX}
        title={emptyMessage}
        description="Try another city or search term, or browse everything we deliver."
        action={
          <Button variant="outline" asChild>
            <Link href="/search">Browse all gifts</Link>
          </Button>
        }
      />
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

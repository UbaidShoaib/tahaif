"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice, cn } from "@/lib/utils";
import type { Product, ProductVariant } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";

type Props = {
  product: Product;
};

export function VariantPicker({ product }: Props) {
  const activeVariants = product.variants.filter((v) => v.is_active);
  const [selected, setSelected] = useState<ProductVariant | null>(
    activeVariants[0] ?? null,
  );
  const [isAdding, setIsAdding] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);

  const { user } = useAuthStore();
  const { addItem } = useCartStore();
  const router = useRouter();

  const basePrice = product.product_cities[0]?.price_override_pkr ?? product.base_price_pkr;
  const totalPrice = basePrice + (selected?.price_delta_pkr ?? 0);
  const inStock = selected ? selected.stock_qty > 0 : true;

  const handleAddToCart = async () => {
    if (!user) {
      router.push("/login?next=" + encodeURIComponent(window.location.pathname));
      return;
    }
    setIsAdding(true);
    try {
      await addItem({
        product_id: product.id,
        variant_id: selected?.id ?? null,
        qty: 1,
      });
      setAddedFeedback(true);
      setTimeout(() => setAddedFeedback(false), 2000);
    } catch (err) {
      console.error("Add to cart failed:", err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Price */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-primary-700 dark:text-primary-400">
          {formatPrice(totalPrice)}
        </span>
        {selected && selected.price_delta_pkr > 0 && (
          <span className="text-sm text-muted-foreground">
            (Base {formatPrice(basePrice)} + {formatPrice(selected.price_delta_pkr)})
          </span>
        )}
      </div>

      {/* Variant buttons */}
      {activeVariants.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {selected ? `Selected: ${selected.name}` : "Choose an option"}
          </p>
          <div className="flex flex-wrap gap-2">
            {activeVariants.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  selected?.id === v.id
                    ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    : "border-border hover:border-primary-400",
                  v.stock_qty === 0 && "opacity-40 cursor-not-allowed",
                )}
                disabled={v.stock_qty === 0}
              >
                {v.name}
                {v.stock_qty === 0 && " (Out of stock)"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add to cart */}
      <Button
        size="lg"
        className="w-full gap-2"
        disabled={!inStock || isAdding}
        onClick={() => { void handleAddToCart(); }}
      >
        <ShoppingBag className="h-5 w-5" />
        {isAdding
          ? "Adding…"
          : addedFeedback
            ? "Added to Cart ✓"
            : inStock
              ? "Add to Cart"
              : "Out of Stock"}
      </Button>

      {selected && selected.stock_qty > 0 && selected.stock_qty <= 5 && (
        <p className="text-xs text-orange-600 font-medium">
          Only {selected.stock_qty} left!
        </p>
      )}
    </div>
  );
}

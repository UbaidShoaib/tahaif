"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Price } from "@/components/money/Price";
import type { Product, ProductVariant } from "@/lib/catalog";
import { GREETING_MAX } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { captureEvent } from "@/components/providers";

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
  const [greeting, setGreeting] = useState("");

  const { user } = useAuthStore();
  const { addItem } = useCartStore();
  const router = useRouter();

  const basePrice = product.product_cities[0]?.price_override_pkr ?? product.base_price_pkr;
  const totalPrice = basePrice + (selected?.price_delta_pkr ?? 0);
  const inStock = selected ? selected.stock_qty > 0 : true;

  const handleAddToCart = async () => {
    if (!user) {
      router.push("/login?callbackUrl=" + encodeURIComponent(window.location.pathname));
      return;
    }
    setIsAdding(true);
    try {
      const message = greeting.trim();
      await addItem({
        product_id: product.id,
        variant_id: selected?.id ?? null,
        qty: 1,
        ...(message ? { greeting_message: message } : {}),
      });
      captureEvent("add_to_cart", {
        product_id: product.id,
        product_name: product.name,
        variant_id: selected?.id,
        price_pkr: totalPrice,
      });
      setAddedFeedback(true);
      setGreeting("");
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
          <Price pkr={totalPrice} />
        </span>
        {selected && selected.price_delta_pkr > 0 && (
          <span className="text-sm text-muted-foreground">
            (Base <Price pkr={basePrice} /> + <Price pkr={selected.price_delta_pkr} />)
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

      {/* Greeting card */}
      <div className="space-y-1.5">
        <label htmlFor="greeting-message" className="text-sm font-medium">
          Greeting card message <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="greeting-message"
          value={greeting}
          maxLength={GREETING_MAX}
          rows={3}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="Happy birthday, Ammi! Wish I could be there. Love, Ali"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
          aria-describedby="greeting-help"
        />
        <p id="greeting-help" className="flex justify-between text-xs text-muted-foreground">
          <span>Printed on a card delivered with this gift.</span>
          <span>{greeting.length}/{GREETING_MAX}</span>
        </p>
      </div>

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

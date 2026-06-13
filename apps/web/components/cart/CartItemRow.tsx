"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCartStore } from "@/stores/cart.store";
import { formatPrice } from "@/lib/utils";
import type { CartItemRead } from "@/lib/cart";

export function CartItemRow({ item }: { item: CartItemRead }) {
  const { updateItem, removeItem } = useCartStore();

  const handleQty = (delta: number) => {
    const next = item.qty + delta;
    if (next <= 0) {
      void removeItem(item.id);
    } else {
      void updateItem(item.id, { qty: next });
    }
  };

  return (
    <div className="flex gap-3 py-3">
      {/* Image */}
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
        {item.product_image ? (
          <Image
            src={item.product_image}
            alt={item.product_name}
            fill
            sizes="64px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">🎁</div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <Link
          href={`/p/${item.product_slug}`}
          className="text-sm font-medium leading-tight hover:text-primary-600 line-clamp-2"
        >
          {item.product_name}
        </Link>
        {item.variant_name && (
          <span className="text-xs text-muted-foreground">{item.variant_name}</span>
        )}
        <span className="text-sm font-semibold text-primary-600">
          {formatPrice(item.line_total_pkr)}
        </span>
      </div>

      {/* Qty controls */}
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={() => void removeItem(item.id)}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Remove item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1 border rounded-lg">
          <button
            onClick={() => handleQty(-1)}
            className="px-2 py-1 hover:bg-muted transition-colors rounded-l-lg"
            aria-label="Decrease quantity"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="px-2 text-sm font-medium tabular-nums">{item.qty}</span>
          <button
            onClick={() => handleQty(1)}
            className="px-2 py-1 hover:bg-muted transition-colors rounded-r-lg"
            aria-label="Increase quantity"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

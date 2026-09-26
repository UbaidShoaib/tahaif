"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCartStore } from "@/stores/cart.store";
import { Price } from "@/components/money/Price";
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
          className="text-sm font-medium leading-tight hover:text-primary-700 dark:hover:text-primary-300 line-clamp-2"
        >
          {item.product_name}
        </Link>
        {item.variant_name && (
          <span className="text-xs text-muted-foreground">{item.variant_name}</span>
        )}
        <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
          <Price pkr={item.line_total_pkr} />
        </span>
      </div>

      {/* Qty controls */}
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={() => void removeItem(item.id)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
          aria-label={`Remove ${item.product_name}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex items-center gap-1 border rounded-lg">
          <button
            onClick={() => handleQty(-1)}
            className="inline-flex h-11 w-11 items-center justify-center hover:bg-muted transition-colors rounded-s-lg"
            aria-label={`Decrease quantity of ${item.product_name}`}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span aria-live="polite" className="px-1 text-sm font-medium tabular-nums">{item.qty}</span>
          <button
            onClick={() => handleQty(1)}
            className="inline-flex h-11 w-11 items-center justify-center hover:bg-muted transition-colors rounded-e-lg"
            aria-label={`Increase quantity of ${item.product_name}`}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

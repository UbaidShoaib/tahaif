"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCartStore } from "@/stores/cart.store";
import { Price } from "@/components/money/Price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { toast } from "@/components/ui/toast";
import type { CartItemRead } from "@/lib/cart";

export function CartItemRow({ item }: { item: CartItemRead }) {
  const { updateItem, removeItem, addItem } = useCartStore();
  const [pending, setPending] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    try {
      await action();
    } catch {
      toast({ variant: "error", title: "Couldn't update your cart", description: "Please try again." });
    } finally {
      setPending(false);
    }
  };

  const remove = () =>
    run(async () => {
      await removeItem(item.id);
      toast({
        variant: "info",
        title: `Removed ${item.product_name}`,
        action: {
          label: "Undo",
          onClick: () => {
            void addItem({
              product_id: item.product_id,
              variant_id: item.variant_id,
              qty: item.qty,
              greeting_message: item.greeting_message,
              delivery_date: item.delivery_date,
              recipient_name: item.recipient_name,
              recipient_phone: item.recipient_phone,
            });
          },
        },
      });
    });

  const setQty = (qty: number) => {
    if (qty <= 0) void remove();
    else void run(() => updateItem(item.id, { qty }));
  };

  return (
    <div className="flex gap-3 py-3">
      {/* Image */}
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
        {item.product_image ? (
          <Image
            src={item.product_image}
            alt=""
            fill
            sizes="64px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div aria-hidden className="flex h-full w-full items-center justify-center text-2xl">🎁</div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={`/p/${item.product_slug}`}
          className="line-clamp-2 text-sm font-medium leading-tight hover:text-link"
        >
          {item.product_name}
        </Link>
        {item.variant_name && <span className="text-xs text-muted-foreground">{item.variant_name}</span>}
        <span className="text-sm font-semibold text-link">
          <Price pkr={item.line_total_pkr} />
        </span>
      </div>

      {/* Qty controls — at qty 1 the minus button becomes Remove. */}
      <div className="flex flex-col items-end gap-1">
        <QuantityStepper value={item.qty} onChange={setQty} itemName={item.product_name} pending={pending} />
        {item.qty > 1 && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={pending}
            className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:underline"
            aria-label={`Remove ${item.product_name}`}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowRight, Gift, Trash2 } from "lucide-react";
import { useCartStore } from "@/stores/cart.store";
import { useAuthStore } from "@/stores/auth.store";
import { CartItemRow } from "@/components/cart/CartItemRow";
import { GreetingEditor } from "@/components/cart/GreetingEditor";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Price } from "@/components/money/Price";

export default function CartPage() {
  const { user } = useAuthStore();
  const { cart, fetchCart, clearCart, isFetching } = useCartStore();

  // Signed in or guest (ADR 0004): fetch whichever cart this browser has.
  useEffect(() => {
    void fetchCart();
  }, [user, fetchCart]);

  if (isFetching && !cart) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-6 text-h1">Your cart</h1>
        <ul aria-busy="true" aria-label="Loading your cart" className="divide-y border-y">
          {[1, 2, 3].map((n) => (
            <li key={n} className="flex gap-4 py-4">
              <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
              <span className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-1/3" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={Gift}
          as="h1"
          title="Your cart is empty"
          description="Find a cake, flowers or something sweet for someone you miss."
          action={
            <Button asChild>
              <Link href="/search">Browse Gifts</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h1 className="text-h1">
          Your cart
          <span className="ms-3 font-sans text-base font-normal text-muted-foreground">
            {cart.item_count} {cart.item_count === 1 ? "gift" : "gifts"}
          </span>
        </h1>
        <button
          type="button"
          onClick={() => {
            void clearCart();
          }}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-destructive"
        >
          <Trash2 aria-hidden className="h-4 w-4" />
          Clear all
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">
        {/* Items: open rows with hairlines, not a box */}
        <ul className="divide-y border-y lg:col-span-2">
          {cart.items.map((item) => (
            <li key={item.id} className="py-2">
              <CartItemRow item={item} />
              <GreetingEditor item={item} />
            </li>
          ))}
        </ul>

        {/* Summary: one soft panel */}
        <div className="lg:col-span-1">
          <section aria-labelledby="cart-summary-heading" className="space-y-4 rounded-2xl bg-background-alt p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 id="cart-summary-heading" className="font-display text-xl">
              Order summary
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Subtotal ({cart.item_count} {cart.item_count === 1 ? "gift" : "gifts"})
                </dt>
                <dd className="tabular-nums">
                  <Price pkr={cart.subtotal_pkr} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="text-muted-foreground">Calculated at checkout</dd>
              </div>
            </dl>
            <div className="flex items-baseline justify-between border-t border-foreground/15 pt-4">
              <span className="font-semibold">Subtotal</span>
              <span className="font-display text-2xl font-semibold tabular-nums">
                <Price pkr={cart.subtotal_pkr} />
              </span>
            </div>
            <Button className="w-full gap-2" size="lg" asChild>
              <Link href="/checkout">
                Proceed to Checkout
                <ArrowRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
            <p className="text-center">
              <Link href="/search" className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline">
                Continue shopping
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

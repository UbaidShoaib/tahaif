"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { useCartStore } from "@/stores/cart.store";
import { useAuthStore } from "@/stores/auth.store";
import { CartItemRow } from "@/components/cart/CartItemRow";
import { GreetingEditor } from "@/components/cart/GreetingEditor";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Your Cart</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex gap-4 animate-pulse rounded-xl border p-4">
              <div className="h-20 w-20 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 w-1/2 rounded bg-muted" />
                <div className="h-3 w-1/4 rounded bg-muted" />
                <div className="h-4 w-1/3 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-24 text-center max-w-md">
        <div className="text-6xl mb-4">🎁</div>
        <h1 className="text-2xl font-bold mb-2">Your cart is empty</h1>
        <p className="text-muted-foreground mb-6">
          Browse our collection and add a gift to get started.
        </p>
        <Button asChild>
          <Link href="/search">Browse Gifts</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          Your Cart
          <span className="ml-2 text-base font-normal text-muted-foreground">
            ({cart.item_count} {cart.item_count === 1 ? "item" : "items"})
          </span>
        </h1>
        <button
          onClick={() => { void clearCart(); }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Clear all
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Items */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border divide-y">
            {cart.items.map((item) => (
              <div key={item.id} className="px-4">
                <CartItemRow item={item} />
                <GreetingEditor item={item} />
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border p-5 space-y-4 sticky top-20">
            <h2 className="font-semibold text-lg">Order Summary</h2>
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Subtotal ({cart.item_count} items)
                </span>
                <span><Price pkr={cart.subtotal_pkr} /></span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span className="text-muted-foreground">At checkout</span>
              </div>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Subtotal</span>
              <span className="text-link"><Price pkr={cart.subtotal_pkr} /></span>
            </div>
            <Button className="w-full gap-2" size="lg" asChild>
              <Link href="/checkout">
                Proceed to Checkout
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/search">Continue Shopping</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { X, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/stores/cart.store";
import { CartItemRow } from "@/components/cart/CartItemRow";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/utils";

export function CartDrawer() {
  const { cart, isDrawerOpen, closeDrawer, isFetching } = useCartStore();

  return (
    <>
      {/* Backdrop */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-background shadow-2xl transition-transform duration-300 ease-in-out ${
          isDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Shopping cart"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Your Cart</h2>
            {(cart?.item_count ?? 0) > 0 && (
              <span className="rounded-full bg-primary-600 px-2 py-0.5 text-xs font-bold text-white">
                {cart?.item_count}
              </span>
            )}
          </div>
          <button
            onClick={closeDrawer}
            className="rounded-full p-1 hover:bg-muted transition-colors"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4">
          {isFetching ? (
            <div className="space-y-3 py-4">
              {[1, 2].map((n) => (
                <div key={n} className="flex gap-3 animate-pulse">
                  <div className="h-16 w-16 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : cart && cart.items.length > 0 ? (
            <div className="divide-y">
              {cart.items.map((item) => (
                <CartItemRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="text-5xl">🎁</div>
              <p className="font-medium">Your cart is empty</p>
              <p className="text-sm text-muted-foreground">
                Add a gift to start an order
              </p>
              <Button variant="outline" size="sm" onClick={closeDrawer} asChild>
                <Link href="/search">Browse Gifts</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {cart && cart.items.length > 0 && (
          <div className="border-t px-4 py-4 space-y-3">
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">{formatPrice(cart.subtotal_pkr)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Delivery fee calculated at checkout
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={closeDrawer} asChild>
                <Link href="/cart">View Cart</Link>
              </Button>
              <Button className="flex-1" onClick={closeDrawer} asChild>
                <Link href="/checkout">Checkout</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

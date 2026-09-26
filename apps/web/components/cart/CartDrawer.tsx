"use client";

import Link from "next/link";
import { Gift } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCartStore } from "@/stores/cart.store";
import { CartItemRow } from "@/components/cart/CartItemRow";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/money/Price";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { useDeliveryCityName } from "@/stores/delivery.store";

export function CartDrawer() {
  const { cart, isDrawerOpen, closeDrawer, isFetching } = useCartStore();
  const cityName = useDeliveryCityName();
  const t = useTranslations("cart");
  const count = cart?.item_count ?? 0;
  const hasItems = !!cart && cart.items.length > 0;

  return (
    <Sheet open={isDrawerOpen} onOpenChange={(open) => { if (!open) closeDrawer(); }}>
      <SheetContent
        side="end"
        title={t("title")}
        closeLabel={t("close")}
        headerExtra={count > 0 ? <Badge variant="brand">{t("items", { count })}</Badge> : null}
      >
        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4" aria-busy={isFetching || undefined}>
          {isFetching && !hasItems ? (
            <div className="space-y-4 py-4">
              {[1, 2].map((n) => (
                <div key={n} className="flex gap-3">
                  <Skeleton className="h-16 w-16 rounded-lg" />
                  <div className="flex-1 space-y-2 pt-1">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : hasItems ? (
            <div className="divide-y">
              {cart.items.map((item) => (
                <CartItemRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Gift}
              as="h3"
              title={t("empty")}
              description={t("emptyHint")}
              action={
                <Button variant="outline" onClick={closeDrawer} asChild>
                  <Link href="/search">{t("browse")}</Link>
                </Button>
              }
            />
          )}
        </div>

        {/* Footer */}
        {hasItems && (
          <div className="space-y-3 border-t px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("subtotal")}</span>
              <span className="font-semibold" aria-live="polite">
                <Price pkr={cart.subtotal_pkr} />
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {cityName ? t("feeToCity", { city: cityName }) : t("feeAtCheckout")}
            </p>
            <Button className="w-full" size="lg" onClick={closeDrawer} asChild>
              <Link href="/checkout">{t("checkout")}</Link>
            </Button>
            <Button variant="ghost" className="w-full" onClick={closeDrawer} asChild>
              <Link href="/cart">{t("viewCart")}</Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

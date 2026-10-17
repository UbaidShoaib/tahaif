"use client";

import Link from "next/link";
import { Lock, MessageSquareHeart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Price } from "@/components/money/Price";
import { CouponField } from "@/components/checkout/CouponField";
import { formatMoney } from "@/lib/money";
import type { CartRead, CheckoutQuote, PaymentMethod } from "@/lib/cart";

export type SummaryTotals = Pick<
  CheckoutQuote,
  "subtotal_pkr" | "delivery_pkr" | "coupon_discount_pkr" | "loyalty_discount_pkr" | "loyalty_points_used" | "total_pkr"
>;

const pkr = (paisa: number) => formatMoney(paisa, "PKR");

/** The cart lines with each gift's card message, so buyers can check them before paying. */
export function SummaryItems({ cart }: { cart: CartRead }) {
  return (
    <ul className="space-y-3 text-sm">
      {cart.items.map((item) => (
        <li key={item.id} className="space-y-1">
          <div className="flex justify-between gap-2">
            <span className="line-clamp-2">
              {item.product_name}
              {item.variant_name ? ` (${item.variant_name})` : ""}
              <span className="text-muted-foreground"> ×{item.qty}</span>
            </span>
            <span className="shrink-0 tabular-nums">{pkr(item.line_total_pkr)}</span>
          </div>
          {item.greeting_message && (
            <p className="flex gap-1.5 rounded-md bg-gold-soft px-2 py-1.5 text-xs text-gold-ink">
              <MessageSquareHeart aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="sr-only">Card message: </span>&ldquo;{item.greeting_message}&rdquo;
              </span>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

type Props = {
  cart: CartRead | null;
  totals: SummaryTotals;
  quote: CheckoutQuote | null;
  isQuoting: boolean;
  hasCity: boolean;
  appliedCoupon: string | null;
  couponError: string | null;
  onApplyCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
  pointsBalance: number;
  useLoyalty: boolean;
  onUseLoyaltyChange: (use: boolean) => void;
  displayCurrency: string;
  paymentMethod: PaymentMethod;
  placeError: string | null;
  isPlacing: boolean;
};

export function OrderSummary({
  cart,
  totals,
  quote,
  isQuoting,
  hasCity,
  appliedCoupon,
  couponError,
  onApplyCoupon,
  onRemoveCoupon,
  pointsBalance,
  useLoyalty,
  onUseLoyaltyChange,
  displayCurrency,
  paymentMethod,
  placeError,
  isPlacing,
}: Props) {
  return (
    <section aria-labelledby="summary-heading" className="space-y-4 rounded-2xl bg-background-alt p-5 sm:p-6 lg:sticky lg:top-24">
      <h2 id="summary-heading" className="font-display text-xl">
        Order summary
      </h2>

      {/* On phones the items are shown in the collapsible summary at the top instead. */}
      {cart && (
        <div className="hidden max-h-64 overflow-y-auto lg:block">
          <SummaryItems cart={cart} />
        </div>
      )}

      <Separator className="hidden lg:block" />

      <dl className="space-y-2 text-sm" aria-live="polite">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{pkr(totals.subtotal_pkr)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="tabular-nums">
            {isQuoting ? "Calculating…" : quote ? pkr(quote.delivery_pkr) : hasCity ? "—" : "Select city"}
          </dd>
        </div>
        {totals.coupon_discount_pkr > 0 && (
          <div className="flex justify-between text-success">
            <dt>Coupon {appliedCoupon}</dt>
            <dd className="tabular-nums">−{pkr(totals.coupon_discount_pkr)}</dd>
          </div>
        )}
        {totals.loyalty_discount_pkr > 0 && (
          <div className="flex justify-between text-success">
            <dt>{totals.loyalty_points_used} loyalty points</dt>
            <dd className="tabular-nums">−{pkr(totals.loyalty_discount_pkr)}</dd>
          </div>
        )}
      </dl>

      <Separator />

      <CouponField applied={appliedCoupon} error={couponError} onApply={onApplyCoupon} onRemove={onRemoveCoupon} />

      {pointsBalance > 0 && (
        <label htmlFor="use-loyalty" className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            id="use-loyalty"
            type="checkbox"
            checked={useLoyalty}
            onChange={(e) => onUseLoyaltyChange(e.target.checked)}
            className="mt-0.5 h-5 w-5"
          />
          <span>
            Use my {pointsBalance} loyalty points
            <span className="block text-xs text-muted-foreground">Each point is worth Rs 1.</span>
          </span>
        </label>
      )}

      <Separator />

      <div className="flex items-baseline justify-between font-semibold">
        <span>Total</span>
        <span className="font-display text-2xl tabular-nums">{pkr(totals.total_pkr)}</span>
      </div>
      {quote && quote.currency !== "PKR" ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          You&apos;ll be charged <strong>{formatMoney(quote.total_charged, quote.currency)}</strong> ({quote.currency}, at
          today&apos;s rate).
        </p>
      ) : displayCurrency !== "PKR" ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {paymentMethod === "cod" ? "Cash on delivery is" : "Bank transfers are"} paid in rupees. That&apos;s{" "}
          <Price pkr={totals.total_pkr} /> in {displayCurrency}.
        </p>
      ) : null}

      {placeError && (
        <Alert variant="destructive">
          <AlertDescription>{placeError}</AlertDescription>
        </Alert>
      )}

      {/*
        One submit button for every screen size: pinned to the bottom of the viewport on
        phones (with the total, so it's always in reach), in the summary card on desktop.
      */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
        <div className="mx-auto flex max-w-4xl items-center gap-3 lg:block">
          <div className="lg:hidden">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-semibold tabular-nums">{pkr(totals.total_pkr)}</p>
          </div>
          <Button type="submit" size="lg" className="flex-1 lg:w-full" loading={isPlacing}>
            {isPlacing ? "Placing Order…" : "Place Order"}
          </Button>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock aria-hidden className="h-3.5 w-3.5" />
        <span>
          By placing your order you agree to our{" "}
          <Link href="/terms" className="underline hover:text-foreground">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/refund" className="underline hover:text-foreground">
            Refund Policy
          </Link>
          .
        </span>
      </p>
    </section>
  );
}

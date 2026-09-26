"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, Clock, MapPin, ShoppingBag, Truck } from "lucide-react";
import { Price } from "@/components/money/Price";
import type { City, Product, ProductCity } from "@/lib/catalog";
import { GREETING_MAX } from "@/lib/cart";
import { earliestDelivery, formatCountdown, formatDeliveryDay } from "@/lib/delivery";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { RadioChip, RadioGroup } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { useCartStore } from "@/stores/cart.store";
import { useDeliveryStore } from "@/stores/delivery.store";
import { captureEvent } from "@/components/providers";
import { useHydrated } from "@/hooks/use-hydrated";

type Props = {
  product: Product;
  /** All cities, for names and time zones. Delivery info is hidden without them. */
  cities?: City[];
};

const DEFAULT_TZ = "Asia/Karachi";

/** "Now", refreshed every minute once mounted (null during SSR so markup matches). */
function useMinuteClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The buy box: price for the chosen city, size, where and when it can be
 * delivered, the greeting card message and Add to Cart.
 */
export function VariantPicker({ product, cities = [] }: Props) {
  const activeVariants = product.variants.filter((v) => v.is_active);
  const firstInStock = activeVariants.find((v) => v.stock_qty > 0) ?? activeVariants[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(firstInStock?.id ?? null);
  const selected = activeVariants.find((v) => v.id === selectedId) ?? null;

  const [isAdding, setIsAdding] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("");

  const { addItem, openDrawer } = useCartStore();
  const deliverTo = useDeliveryStore((s) => s.cityId);
  const setDeliverTo = useDeliveryStore((s) => s.setCity);
  const now = useMinuteClock();
  const hydrated = useHydrated();
  const cityFieldId = useId();

  const available = product.product_cities
    .filter((pc) => pc.is_available)
    .map((pc) => ({ pc, city: cities.find((c) => c.id === pc.city_id) }))
    .filter((x): x is { pc: ProductCity; city: City } => !!x.city);

  const chosen = available.find((x) => x.pc.city_id === deliverTo) ?? null;
  const chosenElsewhere = !!deliverTo && !chosen && available.length > 0;
  const deliverToName = cities.find((c) => c.id === deliverTo)?.name;

  // The chosen city's price, else the base price (the same rule as listings and the API).
  const basePrice = chosen?.pc.price_override_pkr ?? product.base_price_pkr;
  const totalPrice = basePrice + (selected?.price_delta_pkr ?? 0);
  const inStock = selected ? selected.stock_qty > 0 : true;
  const eta = chosen && now ? earliestDelivery(chosen.pc, chosen.city.timezone || DEFAULT_TZ, now) : null;

  // Guests can add to the cart without an account (ADR 0004).
  const handleAddToCart = async () => {
    setIsAdding(true);
    setAddError(null);
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
      toast({
        variant: "success",
        title: "Added to your cart",
        description: selected ? `${product.name} (${selected.name})` : product.name,
        action: { label: "View cart", onClick: () => openDrawer() },
      });
      setGreeting("");
      setTimeout(() => setAddedFeedback(false), 2000);
    } catch (err) {
      console.error("Add to cart failed:", err);
      setAddError(
        err instanceof Error && err.message
          ? `Couldn't add this gift to your cart: ${err.message}`
          : "Couldn't add this gift to your cart. Please try again.",
      );
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Price */}
      <div>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-3xl font-bold text-link">
            <Price pkr={totalPrice} />
          </span>
          {selected && selected.price_delta_pkr > 0 && (
            <span className="text-sm text-muted-foreground">
              (Base <Price pkr={basePrice} /> + <Price pkr={selected.price_delta_pkr} />)
            </span>
          )}
        </p>
        {chosen && (
          <p className="mt-1 text-sm text-muted-foreground">
            Price for delivery in {chosen.city.name}
          </p>
        )}
      </div>

      {/* Variants */}
      {activeVariants.length > 0 && (
        <div className="space-y-2">
          <RadioGroup
            legend="Choose an option"
            hideLegend
            value={selectedId ?? undefined}
            onValueChange={setSelectedId}
            className="flex flex-wrap gap-2"
          >
            {activeVariants.map((v) => (
              <RadioChip key={v.id} value={v.id} disabled={v.stock_qty === 0} disabledReason="Out of stock">
                {v.name}
              </RadioChip>
            ))}
          </RadioGroup>
          <p className="text-sm font-medium">{selected ? `Selected: ${selected.name}` : "Choose an option"}</p>
          {selected && selected.stock_qty > 0 && selected.stock_qty <= 5 && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
              <AlertTriangle aria-hidden className="h-4 w-4" />
              Only {selected.stock_qty} left
            </p>
          )}
        </div>
      )}

      {/* Where & when */}
      {available.length > 0 && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <label htmlFor={cityFieldId} className="flex items-center gap-1.5 text-sm font-medium">
              <MapPin aria-hidden className="h-4 w-4 text-link" />
              Deliver to
            </label>
            <Select id={cityFieldId} value={chosen?.pc.city_id ?? ""} onChange={(e) => setDeliverTo(e.target.value || null)}>
              <option value="">Choose a city…</option>
              {available.map(({ city }) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </Select>
          </div>

          <div aria-live="polite" className="space-y-2 text-sm">
            {chosenElsewhere && (
              <p className="flex items-start gap-1.5 text-warning">
                <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  This gift isn&apos;t delivered to {deliverToName ?? "your chosen city"}. It&apos;s available in{" "}
                  {available.map((a) => a.city.name).join(", ")}.
                </span>
              </p>
            )}
            {chosen && (
              <>
                <p className="flex items-start gap-1.5">
                  <Truck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="whitespace-nowrap">Delivery fee {formatMoney(chosen.pc.delivery_fee_pkr, "PKR")}</span>
                    {eta && (
                      <>
                        <span aria-hidden className="mx-1.5 text-muted-foreground">·</span>
                        <span className="whitespace-nowrap">
                          Earliest:{" "}
                          <strong>{formatDeliveryDay(eta.date, chosen.city.timezone || DEFAULT_TZ, now ?? undefined)}</strong>
                        </span>
                      </>
                    )}
                  </span>
                </p>
                {eta?.sameDay && eta.minutesToCutoff !== null && (
                  <p className="flex items-center gap-1.5 rounded-md bg-gold-soft px-2.5 py-1.5 font-medium text-gold-ink">
                    <Clock aria-hidden className="h-4 w-4" />
                    Order within {formatCountdown(eta.minutesToCutoff)} for same-day delivery
                  </p>
                )}
              </>
            )}
            {!deliverTo && (
              <p className="text-muted-foreground">Choose a city to see the delivery fee and date.</p>
            )}
          </div>
        </div>
      )}

      {/* Greeting card */}
      <FormField
        label="Greeting card message"
        hint={
          <span className="flex justify-between gap-2">
            <span>Optional. Printed on a card delivered with this gift.</span>
            <span className="tabular-nums">
              {greeting.length}/{GREETING_MAX}
            </span>
          </span>
        }
        id="greeting-message"
      >
        {(p) => (
          <Textarea
            {...p}
            value={greeting}
            maxLength={GREETING_MAX}
            rows={3}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Happy birthday, Ammi! Wish I could be there. Love, Ali"
          />
        )}
      </FormField>

      {addError && (
        <Alert variant="destructive">
          <AlertDescription>{addError}</AlertDescription>
        </Alert>
      )}

      {/*
        One Add to Cart button: pinned to the bottom of the screen with the price on phones,
        inline on larger screens. The page adds bottom padding so nothing hides behind it.
      */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
        <div className="flex items-center gap-3">
          <p aria-hidden className="font-semibold tabular-nums text-link md:hidden">
            <Price pkr={totalPrice} />
          </p>
          <Button
            size="lg"
            className="flex-1 gap-2 md:w-full"
            // Disabled until hydrated: a tap on the server-rendered button would do nothing.
            disabled={!inStock || !hydrated}
            loading={isAdding}
            onClick={() => {
              void handleAddToCart();
            }}
          >
            {!isAdding && <ShoppingBag aria-hidden className="h-5 w-5" />}
            {isAdding ? "Adding…" : addedFeedback ? "Added to Cart ✓" : inStock ? "Add to Cart" : "Out of Stock"}
          </Button>
        </div>
      </div>
    </div>
  );
}

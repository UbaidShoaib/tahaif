"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, Check, Clock, MapPin, ShoppingBag, Truck } from "lucide-react";
import { Price } from "@/components/money/Price";
import { isInStock, type City, type Product, type ProductCity } from "@/lib/catalog";
import { addDays, earliestDelivery, formatCountdown, formatDeliveryDay, zonedNow } from "@/lib/delivery";
import { cityTimeToInstant, formatClock, viewerSuffix, viewerTimeZone } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RadioChip, RadioGroup } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { useCartStore } from "@/stores/cart.store";
import { useDeliveryStore } from "@/stores/delivery.store";
import { captureEvent } from "@/components/providers";
import { useHydrated } from "@/hooks/use-hydrated";
import { GreetingComposer } from "@/components/greeting/GreetingComposer";
import { OrderOnWhatsApp } from "@/components/catalog/OrderOnWhatsApp";

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

type StepKey = "size" | "when" | "card";
const STEP_TITLES: Record<StepKey, string> = { size: "Size", when: "When should it arrive?", card: "Your card" };

/** One numbered step of the buy box: a heading that reopens it, its summary once done, its body while open. */
function Step({
  n,
  stepKey,
  open,
  reached,
  summary,
  onOpen,
  children,
}: {
  n: number;
  stepKey: StepKey;
  open: boolean;
  reached: boolean;
  summary?: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  const bodyId = useId();
  return (
    <section
      aria-label={`Step ${n}: ${STEP_TITLES[stepKey]}`}
      className={`rounded-xl border p-4 transition-colors sm:p-5 ${open ? "border-primary-700" : "border-border"} ${reached ? "" : "opacity-60"}`}
    >
      <h2 className="font-sans text-base font-semibold">
        <button
          type="button"
          onClick={onOpen}
          disabled={!reached || open}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center justify-between gap-3 text-start disabled:cursor-default"
        >
          <span>
            {n} · {STEP_TITLES[stepKey]}
          </span>
          {!open && reached && summary && (
            <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
              {summary}
              <Check aria-hidden className="h-4 w-4 text-success" />
              <span className="sr-only">, change</span>
            </span>
          )}
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="mt-4 space-y-4">
        {children}
      </div>
    </section>
  );
}

/**
 * The buy box (layout decision: step-by-step builder). Three short steps —
 * size, when, card — each opening after the previous one, so the delivery
 * day and card message are hard to forget. Choices are kept after adding to
 * the cart, so a second gift only needs a new card.
 */
export function VariantPicker({ product, cities = [] }: Props) {
  const activeVariants = product.variants.filter((v) => v.is_active);
  const firstInStock = activeVariants.find(isInStock) ?? activeVariants[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(firstInStock?.id ?? null);
  const selected = activeVariants.find((v) => v.id === selectedId) ?? null;

  const [isAdding, setIsAdding] = useState(false);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("");
  const [day, setDay] = useState("");

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
  const inStock = selected ? isInStock(selected) : true;
  const eta = chosen && now ? earliestDelivery(chosen.pc, chosen.city.timezone || DEFAULT_TZ, now) : null;
  // The cutoff as a clock time, in the city and (for buyers abroad) their own zone.
  // `now` is only set after mount, so reading the browser's zone here is hydration-safe.
  const cutoff =
    chosen && eta?.sameDay && chosen.pc.same_day_cutoff
      ? (() => {
          const tz = chosen.city.timezone || DEFAULT_TZ;
          const at = cityTimeToInstant(eta.date, chosen.pc.same_day_cutoff, tz);
          return { city: formatClock(at, tz), viewer: viewerSuffix(at, tz, viewerTimeZone()) };
        })()
      : null;

  const tz = chosen?.city.timezone || DEFAULT_TZ;
  const today = now ? zonedNow(tz, now).date : "";
  const tomorrow = today ? addDays(today, 1) : "";
  // The chosen day follows the earliest possible one when the city changes or time moves past it.
  useEffect(() => {
    if (eta && (!day || day < eta.date)) setDay(eta.date);
  }, [eta?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps: StepKey[] = [
    ...(activeVariants.length > 0 ? (["size"] as const) : []),
    ...(available.length > 0 ? (["when"] as const) : []),
    "card",
  ];
  const [openIdx, setOpenIdx] = useState(0);
  const [reachedIdx, setReachedIdx] = useState(0);
  const isLast = openIdx === steps.length - 1;
  const openKey = steps[openIdx];
  const canContinue = openKey !== "when" || (!!chosen && !!day);
  const advance = () => {
    const next = Math.min(openIdx + 1, steps.length - 1);
    setOpenIdx(next);
    setReachedIdx((r) => Math.max(r, next));
  };
  const daySummary = day && chosen ? `${formatDeliveryDay(day, tz, now ?? undefined)}, ${chosen.city.name}` : undefined;
  // Which chip the chosen day falls under; anything past the quick picks is "Pick a date".
  const quickDays = eta ? [eta.sameDay ? today : "", eta.date <= tomorrow ? tomorrow : eta.date] : [];
  const [pickingDate, setPickingDate] = useState(false);
  const dayChoice = pickingDate || (day && !quickDays.includes(day)) ? "other" : day;
  const otherDefault = eta ? addDays(eta.date > tomorrow ? eta.date : tomorrow, 1) : "";

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
        ...(chosen && day ? { delivery_date: day } : {}),
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
          <span className="font-display text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">
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

      <div className="space-y-3">
        {steps.map((key, i) => (
          <Step
            key={key}
            n={i + 1}
            stepKey={key}
            open={openIdx === i}
            reached={i <= reachedIdx}
            summary={key === "size" ? selected?.name : key === "when" ? daySummary : greeting.trim() ? "Message added" : "No message"}
            onOpen={() => setOpenIdx(i)}
          >
            {key === "size" && (
              <div className="space-y-2">
                <RadioGroup
                  legend="Choose a size"
                  hideLegend
                  value={selectedId ?? undefined}
                  onValueChange={setSelectedId}
                  className="flex flex-wrap gap-2"
                >
                  {activeVariants.map((v) => (
                    <RadioChip key={v.id} value={v.id} disabled={!isInStock(v)} disabledReason="Out of stock">
                      {v.name}
                    </RadioChip>
                  ))}
                </RadioGroup>
                {selected?.stock_qty != null && selected.stock_qty > 0 && selected.stock_qty <= 5 && (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
                    <AlertTriangle aria-hidden className="h-4 w-4" />
                    Only {selected.stock_qty} left
                  </p>
                )}
              </div>
            )}

            {key === "when" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor={cityFieldId} className="flex items-center gap-1.5 text-sm font-medium">
                    <MapPin aria-hidden className="h-4 w-4 text-link" />
                    Deliver to
                  </label>
                  <Select
                    id={cityFieldId}
                    value={chosen?.pc.city_id ?? ""}
                    onChange={(e) => setDeliverTo(e.target.value || null)}
                  >
                    <option value="">Choose a city…</option>
                    {available.map(({ city }) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </Select>
                </div>

                {chosen && eta && day && (
                  <div className="space-y-2">
                    <RadioGroup
                      legend="Arrives on"
                      value={dayChoice}
                      onValueChange={(v) => {
                        setPickingDate(v === "other");
                        setDay(v === "other" ? otherDefault : v);
                      }}
                      className="flex flex-wrap gap-2"
                    >
                      {eta.sameDay && <RadioChip value={today}>Today</RadioChip>}
                      {eta.date <= tomorrow && <RadioChip value={tomorrow}>Tomorrow</RadioChip>}
                      {eta.date > tomorrow && (
                        <RadioChip value={eta.date}>{formatDeliveryDay(eta.date, tz, now ?? undefined)}</RadioChip>
                      )}
                      <RadioChip value="other">Pick a date</RadioChip>
                    </RadioGroup>
                    {dayChoice === "other" && (
                      <Input
                        type="date"
                        aria-label="Delivery date"
                        min={eta.date}
                        value={day}
                        onChange={(e) => e.target.value && e.target.value >= eta.date && setDay(e.target.value)}
                        className="max-w-xs"
                      />
                    )}
                  </div>
                )}

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
                          <span className="whitespace-nowrap">
                            Delivery fee {formatMoney(chosen.pc.delivery_fee_pkr, "PKR")}
                          </span>
                          {eta && (
                            <>
                              <span aria-hidden className="mx-1.5 text-muted-foreground">·</span>
                              <span className="whitespace-nowrap">
                                Earliest: <strong>{formatDeliveryDay(eta.date, tz, now ?? undefined)}</strong>
                              </span>
                            </>
                          )}
                        </span>
                      </p>
                      {eta?.sameDay && eta.minutesToCutoff !== null && (
                        <p className="flex items-start gap-1.5 rounded-md bg-gold-soft px-2.5 py-1.5 font-medium text-gold-ink">
                          <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>
                            Order within {formatCountdown(eta.minutesToCutoff)} for same-day delivery
                            {cutoff && (
                              <span className="block text-xs font-normal">
                                Order by {cutoff.city} {chosen.city.name} time
                                {cutoff.viewer && <> ({cutoff.viewer})</>}
                              </span>
                            )}
                          </span>
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

            {key === "card" && <GreetingComposer id="greeting-message" value={greeting} onChange={setGreeting} />}
          </Step>
        ))}
      </div>

      <OrderOnWhatsApp
        productId={product.id}
        productPath={`/p/${product.slug}`}
        productName={product.name}
        variantName={selected?.name}
        pricePkr={totalPrice}
        cityName={chosen?.city.name}
        greeting={greeting}
      />

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
          <p aria-hidden className="font-display text-lg font-semibold tabular-nums text-foreground md:hidden">
            <Price pkr={totalPrice} />
          </p>
          {isLast ? (
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
          ) : (
            <Button size="lg" className="flex-1 md:w-full" disabled={!canContinue || !hydrated} onClick={advance}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

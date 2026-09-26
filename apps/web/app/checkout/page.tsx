"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ChevronDown, Gift, Lock, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/stores/cart.store";
import { useAuthStore } from "@/stores/auth.store";
import { useCurrencyStore } from "@/stores/currency.store";
import { useDeliveryStore } from "@/stores/delivery.store";
import { cartApi, type CheckoutQuote, type PaymentMethod } from "@/lib/cart";
import { ApiError } from "@/lib/api";
import { accountApi, type AddressRead } from "@/lib/account";
import { loyaltyApi } from "@/lib/loyalty";
import { formatMoney } from "@/lib/money";
import { captureEvent } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  checkoutSchema,
  FIELD_ORDER,
  localToday,
  type CheckoutFormValues,
} from "@/components/checkout/checkout-schema";
import { DeliveryDetailsSection, type CheckoutCity } from "@/components/checkout/DeliveryDetailsSection";
import { PaymentMethodSection } from "@/components/checkout/PaymentMethodSection";
import { OrderSummary, SummaryItems, type SummaryTotals } from "@/components/checkout/OrderSummary";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function fetchCities(): Promise<CheckoutCity[]> {
  const res = await fetch(`${API_BASE}/cities`);
  if (!res.ok) return [];
  return res.json() as Promise<CheckoutCity[]>;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { cart, fetchCart } = useCartStore();
  const displayCurrency = useCurrencyStore((s) => s.currency);

  const [cities, setCities] = useState<CheckoutCity[]>([]);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [addresses, setAddresses] = useState<AddressRead[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");

  const [today] = useState(localToday);
  const [errorList, setErrorList] = useState<{ name: string; label: string; message: string }[]>([]);
  // Bumped on every failed submit so a repeat attempt re-focuses the summary.
  const [invalidAttempt, setInvalidAttempt] = useState(0);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  // Reuse the Idempotency-Key when the buyer retries the exact same order (e.g. after a
  // network timeout), so a request that did reach the server can't create a second order.
  const attemptRef = useRef<{ payload: string; key: string } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    // We focus the error summary instead; it links to each field.
    shouldFocusError: false,
    defaultValues: {
      payment_method: "cod",
      delivery_city_id: useDeliveryStore.getState().cityId ?? "",
      delivery_date: today,
      recipient_name: "",
      recipient_phone: "",
      address_line1: "",
      address_line2: "",
      landmark: "",
      notes: "",
    },
  });

  const cityId = watch("delivery_city_id");
  const paymentMethod = watch("payment_method");

  useEffect(() => {
    if (user) void fetchCart();
    void fetchCities().then(setCities);
  }, [user, fetchCart]);

  // Saved addresses and loyalty balance are optional extras: failures just hide them.
  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    if (!user || !token) return;
    accountApi.listAddresses(token).then(setAddresses).catch(() => setAddresses([]));
    loyaltyApi.getWallet(token).then((w) => setPointsBalance(w.balance_points)).catch(() => setPointsBalance(0));
  }, [user]);

  const doQuote = useCallback(async () => {
    if (!cityId || !user) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    setIsQuoting(true);
    try {
      const q = await cartApi.quote(cityId, token, {
        couponCode: appliedCoupon,
        useLoyaltyPoints: useLoyalty,
        paymentMethod,
      });
      setQuote(q);
      // Only a successful quote *with* a coupon clears a coupon error; the
      // requote that follows a rejected coupon must keep the explanation visible.
      if (appliedCoupon) setCouponError(null);
    } catch (err) {
      if (appliedCoupon && err instanceof ApiError && err.status === 400) {
        // Bad coupon: explain why and fall back to the undiscounted quote.
        setCouponError(err.detail);
        setAppliedCoupon(null);
      } else {
        setQuote(null);
      }
    } finally {
      setIsQuoting(false);
    }
  }, [cityId, paymentMethod, user, appliedCoupon, useLoyalty]);

  useEffect(() => {
    if (cityId) void doQuote();
  }, [cityId, doQuote]);

  const applyCoupon = (code: string) => {
    if (!getValues("delivery_city_id")) {
      setCouponError("Choose a delivery city first so we can price your order.");
      return;
    }
    setCouponError(null);
    setAppliedCoupon(code);
  };

  const selectAddress = (id: string) => {
    setSelectedAddressId(id);
    const a = addresses.find((x) => x.id === id);
    const opts = { shouldValidate: errorList.length > 0, shouldDirty: true };
    if (!a) {
      // "A new address": clear the recipient fields for fresh entry.
      for (const k of ["recipient_name", "recipient_phone", "address_line1", "address_line2", "landmark"] as const) {
        setValue(k, "", opts);
      }
      return;
    }
    const city = cities.find((c) => c.name.toLowerCase() === a.city_name.toLowerCase());
    setValue("recipient_name", a.recipient_name, opts);
    setValue("recipient_phone", a.recipient_phone, opts);
    setValue("address_line1", a.line1, opts);
    setValue("address_line2", a.line2 ?? "", opts);
    setValue("landmark", a.landmark ?? "", opts);
    if (city) {
      setValue("delivery_city_id", city.id, opts);
      useDeliveryStore.getState().setCity(city.id);
    }
  };

  // Start from the buyer's default saved address (once), unless they've already typed one.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || addresses.length === 0 || cities.length === 0) return;
    prefilled.current = true;
    const def = addresses.find((a) => a.is_default);
    if (def && !getValues("recipient_name") && !getValues("address_line1")) selectAddress(def.id);
    // selectAddress is recreated every render; this effect must only run once per load.
  }, [addresses, cities]); // eslint-disable-line react-hooks/exhaustive-deps

  const onValid = async (values: CheckoutFormValues) => {
    setErrorList([]);
    const token = useAuthStore.getState().accessToken;
    if (!user || !token) return;
    setIsPlacing(true);
    setPlaceError(null);
    captureEvent("checkout_start", { payment_method: values.payment_method });

    const body = { ...values, coupon_code: appliedCoupon, use_loyalty_points: useLoyalty };
    const payload = JSON.stringify(body);
    if (attemptRef.current?.payload !== payload) {
      attemptRef.current = { payload, key: crypto.randomUUID() };
    }
    try {
      const order = await cartApi.place(body, token, attemptRef.current.key);
      captureEvent("order_placed", {
        order_id: order.id,
        total_pkr: order.total_pkr,
        payment_method: order.payment_method,
        item_count: order.items.length,
      });
      attemptRef.current = null;
      await fetchCart();
      router.push(`/checkout/success/${order.public_token}`);
    } catch (err: unknown) {
      setPlaceError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsPlacing(false);
    }
  };

  const onInvalid = (errs: FieldErrors<CheckoutFormValues>) => {
    const list = FIELD_ORDER.flatMap(({ name, label }) => {
      const message = errs[name]?.message;
      return message ? [{ name, label, message }] : [];
    });
    setErrorList(list);
    setInvalidAttempt((n) => n + 1);
  };

  // After the summary renders, move focus to it so keyboard and screen-reader users hear it.
  useEffect(() => {
    if (invalidAttempt > 0) errorSummaryRef.current?.focus();
  }, [invalidAttempt]);

  if (!user) {
    return (
      <div className="container mx-auto max-w-md px-4 py-24">
        <EmptyState
          icon={ShoppingBag}
          as="h1"
          title="Sign in to checkout"
          description="Your cart and saved addresses are linked to your account."
          action={
            <Button asChild>
              <Link href="/login?callbackUrl=/checkout">Sign in</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (cart && cart.items.length === 0) {
    return (
      <div className="container mx-auto max-w-md px-4 py-24">
        <EmptyState
          icon={Gift}
          as="h1"
          title="Your cart is empty"
          description="Add a gift to start an order."
          action={
            <Button asChild>
              <Link href="/search">Browse Gifts</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const totals: SummaryTotals = quote ?? {
    subtotal_pkr: cart?.subtotal_pkr ?? 0,
    delivery_pkr: 0,
    coupon_discount_pkr: 0,
    loyalty_discount_pkr: 0,
    loyalty_points_used: 0,
    total_pkr: cart?.subtotal_pkr ?? 0,
  };

  return (
    // Bottom padding leaves room for the pinned Place Order bar on phones.
    <div className="container mx-auto max-w-5xl px-4 pb-32 pt-6 lg:pb-12">
      <div className="mb-6 flex items-center gap-2">
        <Link
          href="/cart"
          aria-label="Back to cart"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
        </Link>
        <h1 className="text-h1">Checkout</h1>
        <span className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="h-3.5 w-3.5" /> Secure checkout
        </span>
      </div>

      {/* Phones: collapsible item list with the running total, above the form. */}
      {cart && (
        <details className="group mb-6 rounded-xl border bg-card lg:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 font-medium [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              Order summary
              <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
            <span className="tabular-nums text-link">{formatMoney(totals.total_pkr, "PKR")}</span>
          </summary>
          <div className="border-t px-4 py-3">
            <SummaryItems cart={cart} />
          </div>
        </details>
      )}

      <form
        noValidate
        onSubmit={(e) => void handleSubmit(onValid, onInvalid)(e)}
        className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8"
      >
        <div className="space-y-6 lg:col-span-2">
          {errorList.length > 0 && (
            <Alert variant="destructive" ref={errorSummaryRef} tabIndex={-1} aria-labelledby="error-summary-title">
              <AlertTitle id="error-summary-title">
                {errorList.length === 1 ? "1 thing needs fixing" : `${errorList.length} things need fixing`} before we
                can place your order
              </AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-disc space-y-1 ps-5">
                  {errorList.map((e) => (
                    <li key={e.name}>
                      <a href={`#${e.name}`} className="underline underline-offset-2 hover:no-underline">
                        {e.label}: {e.message}
                      </a>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <DeliveryDetailsSection
            register={register}
            errors={errors}
            cities={cities}
            addresses={addresses}
            selectedAddressId={selectedAddressId}
            onSelectAddress={selectAddress}
            minDate={today}
            onCityChange={(id) => useDeliveryStore.getState().setCity(id || null)}
          />

          <PaymentMethodSection
            value={paymentMethod}
            onChange={(m: PaymentMethod) => setValue("payment_method", m, { shouldDirty: true })}
          />
        </div>

        <div className="lg:col-span-1">
          <OrderSummary
            cart={cart}
            totals={totals}
            quote={quote}
            isQuoting={isQuoting}
            hasCity={!!cityId}
            appliedCoupon={appliedCoupon}
            couponError={couponError}
            onApplyCoupon={applyCoupon}
            onRemoveCoupon={() => setAppliedCoupon(null)}
            pointsBalance={pointsBalance}
            useLoyalty={useLoyalty}
            onUseLoyaltyChange={setUseLoyalty}
            displayCurrency={displayCurrency}
            paymentMethod={paymentMethod}
            placeError={placeError}
            isPlacing={isPlacing}
          />
        </div>
      </form>
    </div>
  );
}

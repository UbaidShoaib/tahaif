"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCartStore } from "@/stores/cart.store";
import { useAuthStore } from "@/stores/auth.store";
import { cartApi, type CheckoutPlace, type CheckoutQuote, type PaymentMethod } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/money";
import { Price } from "@/components/money/Price";
import { useCurrencyStore } from "@/stores/currency.store";
import { ApiError } from "@/lib/api";
import { accountApi, type AddressRead } from "@/lib/account";
import { loyaltyApi } from "@/lib/loyalty";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { captureEvent } from "@/components/providers";

type City = { id: string; name: string; slug: string; is_active: boolean };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function fetchCities(): Promise<City[]> {
  const res = await fetch(`${API_BASE}/cities`);
  if (!res.ok) return [];
  return res.json() as Promise<City[]>;
}

const today = new Date().toISOString().split("T")[0] ?? "";

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { cart, fetchCart } = useCartStore();
  const displayCurrency = useCurrencyStore((s) => s.currency);

  const [cities, setCities] = useState<City[]>([]);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [addresses, setAddresses] = useState<AddressRead[]>([]);

  const [form, setForm] = useState<CheckoutPlace>({
    payment_method: "cod",
    delivery_city_id: "",
    delivery_date: today,
    recipient_name: "",
    recipient_phone: "",
    address_line1: "",
    address_line2: "",
    landmark: "",
    notes: "",
  });

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
    if (!form.delivery_city_id || !user) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    setIsQuoting(true);
    try {
      const q = await cartApi.quote(form.delivery_city_id, token, {
        couponCode: appliedCoupon,
        useLoyaltyPoints: useLoyalty,
        paymentMethod: form.payment_method,
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
  }, [form.delivery_city_id, form.payment_method, user, appliedCoupon, useLoyalty]);

  useEffect(() => {
    if (form.delivery_city_id) void doQuote();
  }, [form.delivery_city_id, doQuote]);

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    if (!form.delivery_city_id) {
      setCouponError("Choose a delivery city first so we can price your order.");
      return;
    }
    setCouponError(null);
    setAppliedCoupon(code);
  };

  const fillFromSavedAddress = (id: string) => {
    const a = addresses.find((x) => x.id === id);
    if (!a) return;
    const city = cities.find((c) => c.name.toLowerCase() === a.city_name.toLowerCase());
    setForm((f) => ({
      ...f,
      recipient_name: a.recipient_name,
      recipient_phone: a.recipient_phone,
      address_line1: a.line1,
      address_line2: a.line2 ?? "",
      landmark: a.landmark ?? "",
      delivery_city_id: city?.id ?? f.delivery_city_id,
    }));
  };

  const set = (key: keyof CheckoutPlace, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handlePlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    setIsPlacing(true);
    setError(null);
    captureEvent("checkout_start", { payment_method: form.payment_method });
    try {
      const idempotencyKey = crypto.randomUUID();
      const order = await cartApi.place(
        { ...form, coupon_code: appliedCoupon, use_loyalty_points: useLoyalty },
        token,
        idempotencyKey,
      );
      captureEvent("order_placed", {
        order_id: order.id,
        total_pkr: order.total_pkr,
        payment_method: order.payment_method,
        item_count: order.items.length,
      });
      await fetchCart();
      router.push(`/checkout/success/${order.public_token}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsPlacing(false);
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-24 text-center max-w-md">
        <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Sign in to checkout</h1>
        <Button asChild>
          <Link href="/login?callbackUrl=/checkout">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (cart && cart.items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-24 text-center max-w-md">
        <div className="text-6xl mb-4">🎁</div>
        <h1 className="text-2xl font-bold mb-2">Your cart is empty</h1>
        <Button asChild>
          <Link href="/search">Browse Gifts</Link>
        </Button>
      </div>
    );
  }

  const summary = quote ?? {
    subtotal_pkr: cart?.subtotal_pkr ?? 0,
    delivery_pkr: 0,
    coupon_discount_pkr: 0,
    loyalty_discount_pkr: 0,
    loyalty_points_used: 0,
    total_pkr: cart?.subtotal_pkr ?? 0,
    currency: "PKR",
    total_charged: cart?.subtotal_pkr ?? 0,
  };
  const pkr = (paisa: number) => formatMoney(paisa, "PKR");

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/cart"
          aria-label="Back to cart"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="text-2xl font-bold">Checkout</h1>
      </div>

      <form onSubmit={(e) => { void handlePlace(e); }} className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Form fields */}
        <div className="lg:col-span-2 space-y-6">
          {/* Delivery info */}
          <section className="rounded-xl border p-5 space-y-4">
            <h2 className="font-semibold text-lg">Delivery Details</h2>

            {addresses.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="saved-address">Send to a saved address</Label>
                <select
                  id="saved-address"
                  defaultValue=""
                  onChange={(e) => fillFromSavedAddress(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Choose a recipient…</option>
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.recipient_name}, {a.line1}, {a.city_name}{a.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="city">Delivery City *</Label>
                <select
                  id="city"
                  required
                  value={form.delivery_city_id}
                  onChange={(e) => set("delivery_city_id", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select city…</option>
                  {cities.filter((c) => c.is_active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="delivery_date">Delivery Date *</Label>
                <Input
                  id="delivery_date"
                  type="date"
                  required
                  min={today}
                  value={form.delivery_date}
                  onChange={(e) => set("delivery_date", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="recipient_name">Recipient Name *</Label>
                <Input
                  id="recipient_name"
                  required
                  autoComplete="shipping name"
                  minLength={2}
                  placeholder="Full name of recipient"
                  value={form.recipient_name}
                  onChange={(e) => set("recipient_name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recipient_phone">Recipient Phone *</Label>
                <Input
                  id="recipient_phone"
                  type="tel"
                  inputMode="tel"
                  required
                  autoComplete="shipping tel"
                  placeholder="+92 300 1234567"
                  value={form.recipient_phone}
                  onChange={(e) => set("recipient_phone", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address_line1">Address *</Label>
              <Input
                id="address_line1"
                required
                autoComplete="shipping address-line1"
                minLength={5}
                placeholder="House/flat, street, area"
                value={form.address_line1}
                onChange={(e) => set("address_line1", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="address_line2">Apartment / Floor (optional)</Label>
                <Input
                  id="address_line2"
                  autoComplete="shipping address-line2"
                  placeholder="e.g. Flat 3B"
                  value={form.address_line2 ?? ""}
                  onChange={(e) => set("address_line2", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="landmark">Nearby Landmark (optional)</Label>
                <Input
                  id="landmark"
                  placeholder="e.g. Near McDonalds"
                  value={form.landmark ?? ""}
                  onChange={(e) => set("landmark", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Order Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="Special instructions for your order"
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </section>

          {/* Payment method */}
          <section className="rounded-xl border p-5 space-y-4">
            <h2 className="font-semibold text-lg">Payment Method</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { value: "cod", label: "Cash on Delivery", desc: "Pay when delivered" },
                { value: "bank_transfer", label: "Bank Transfer", desc: "Transfer & send proof" },
              ] as { value: PaymentMethod; label: string; desc: string }[]).map((pm) => (
                <button
                  key={pm.value}
                  type="button"
                  aria-pressed={form.payment_method === pm.value}
                  onClick={() => set("payment_method", pm.value)}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    form.payment_method === pm.value
                      ? "border-primary-700 bg-primary-50 dark:bg-primary-900/30"
                      : "border-input hover:border-primary-400"
                  }`}
                >
                  <p className="font-medium">{pm.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{pm.desc}</p>
                </button>
              ))}
            </div>
            {form.payment_method === "bank_transfer" && (
              <div className="rounded-lg bg-muted p-4 text-sm space-y-1">
                <p className="font-medium">Bank Transfer Details</p>
                <p>Account: {process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME ?? "Tahaif Gifts — MCB Bank"}</p>
                <p>IBAN: {process.env.NEXT_PUBLIC_BANK_IBAN ?? "—"}</p>
                <p className="text-muted-foreground">After placing your order, transfer the total amount and upload your payment receipt on the confirmation page.</p>
              </div>
            )}
          </section>
        </div>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border p-5 space-y-4 sticky top-20">
            <h2 className="font-semibold text-lg">Order Summary</h2>
            <Separator />

            {cart && (
              <div className="space-y-2 text-sm max-h-48 overflow-y-auto">
                {cart.items.map((item) => (
                  <div key={item.id} className="flex justify-between gap-2">
                    <span className="text-muted-foreground line-clamp-1">
                      {item.product_name}
                      {item.variant_name ? ` (${item.variant_name})` : ""}
                      {" ×"}{item.qty}
                    </span>
                    <span className="shrink-0">{pkr(item.line_total_pkr)}</span>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{pkr(summary.subtotal_pkr)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span aria-live="polite">
                  {isQuoting
                    ? "Calculating…"
                    : quote
                      ? pkr(quote.delivery_pkr)
                      : "Select city"}
                </span>
              </div>
              {summary.coupon_discount_pkr > 0 && (
                <div className="flex justify-between text-primary-700 dark:text-primary-400">
                  <span>Coupon {appliedCoupon}</span>
                  <span>−{pkr(summary.coupon_discount_pkr)}</span>
                </div>
              )}
              {summary.loyalty_discount_pkr > 0 && (
                <div className="flex justify-between text-primary-700 dark:text-primary-400">
                  <span>{summary.loyalty_points_used} loyalty points</span>
                  <span>−{pkr(summary.loyalty_discount_pkr)}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Coupon */}
            <div className="space-y-1.5">
              <Label htmlFor="coupon">Coupon code</Label>
              {appliedCoupon ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="font-mono">{appliedCoupon}</span>
                  <button
                    type="button"
                    onClick={() => { setAppliedCoupon(null); setCouponInput(""); }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="coupon"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                    placeholder="EID10"
                    aria-describedby={couponError ? "coupon-error" : undefined}
                  />
                  <Button type="button" variant="secondary" onClick={applyCoupon} disabled={!couponInput.trim()}>
                    Apply
                  </Button>
                </div>
              )}
              {couponError && <p id="coupon-error" role="alert" className="text-xs text-destructive">{couponError}</p>}
            </div>

            {/* Loyalty */}
            {pointsBalance > 0 && (
              <label htmlFor="use-loyalty" className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  id="use-loyalty"
                  type="checkbox"
                  checked={useLoyalty}
                  onChange={(e) => setUseLoyalty(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary-700"
                />
                <span>
                  Use my {pointsBalance} loyalty points
                  <span className="block text-xs text-muted-foreground">Each point is worth Rs 1.</span>
                </span>
              </label>
            )}

            <Separator />

            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary-700 dark:text-primary-300">{pkr(summary.total_pkr)}</span>
            </div>
            {quote && quote.currency !== "PKR" ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                You&apos;ll be charged{" "}
                <strong>{formatMoney(quote.total_charged, quote.currency)}</strong>{" "}
                ({quote.currency}, at today&apos;s rate).
              </p>
            ) : displayCurrency !== "PKR" ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {form.payment_method === "cod" ? "Cash on delivery is" : "Bank transfers are"} paid in
                rupees. That&apos;s <Price pkr={summary.total_pkr} /> in {displayCurrency}.
              </p>
            ) : null}

            {error && (
              <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={isPlacing}
            >
              {isPlacing ? "Placing Order…" : "Place Order"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Fields marked * are required. By placing your order, you agree to our{" "}
              <Link href="/terms" className="underline">Terms</Link>
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}

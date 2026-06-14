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
import { formatPrice } from "@/lib/utils";
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

  const [cities, setCities] = useState<City[]>([]);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const doQuote = useCallback(async () => {
    if (!form.delivery_city_id || !user) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    setIsQuoting(true);
    try {
      const q = await cartApi.quote(form.delivery_city_id, token);
      setQuote(q);
    } catch {
      setQuote(null);
    } finally {
      setIsQuoting(false);
    }
  }, [form.delivery_city_id, user]);

  useEffect(() => {
    if (form.delivery_city_id) void doQuote();
  }, [form.delivery_city_id, doQuote]);

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
      const order = await cartApi.place(form, token, idempotencyKey);
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
    total_pkr: cart?.subtotal_pkr ?? 0,
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/cart" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Checkout</h1>
      </div>

      <form onSubmit={(e) => { void handlePlace(e); }} className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Form fields */}
        <div className="lg:col-span-2 space-y-6">
          {/* Delivery info */}
          <section className="rounded-xl border p-5 space-y-4">
            <h2 className="font-semibold text-lg">Delivery Details</h2>

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
                  required
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
                  onClick={() => set("payment_method", pm.value)}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    form.payment_method === pm.value
                      ? "border-primary-600 bg-primary-50 dark:bg-primary-900/20"
                      : "border-border hover:border-primary-300"
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
                    <span className="shrink-0">{formatPrice(item.line_total_pkr)}</span>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(summary.subtotal_pkr)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span>
                  {isQuoting
                    ? "Calculating…"
                    : quote
                      ? formatPrice(quote.delivery_pkr)
                      : "Select city"}
                </span>
              </div>
            </div>

            <Separator />

            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary-600">{formatPrice(summary.total_pkr)}</span>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isPlacing || !form.delivery_city_id || !form.recipient_name || !form.recipient_phone || !form.address_line1}
            >
              {isPlacing ? "Placing Order…" : "Place Order"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              By placing your order, you agree to our{" "}
              <Link href="/terms" className="underline">Terms</Link>
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}

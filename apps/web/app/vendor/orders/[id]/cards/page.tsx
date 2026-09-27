"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardPreview } from "@/components/greeting/CardPreview";
import { useAuthStore } from "@/stores/auth.store";
import { vendorApi, type VendorFulfillmentRead } from "@/lib/vendor";

/**
 * Print view of a fulfillment's greeting cards: one card per item with a
 * message, laid out for printing (site header and footer are hidden in print).
 */
export default function PrintCardsPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, isLoading } = useAuthStore();
  const [fulfillment, setFulfillment] = useState<VendorFulfillmentRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !accessToken) return;
    vendorApi
      .getFulfillment(id, accessToken)
      .then(setFulfillment)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load this order."));
  }, [id, accessToken, isLoading]);

  if (!isLoading && !accessToken) {
    return <p className="container mx-auto px-4 py-16 text-center text-muted-foreground">Please sign in to print cards.</p>;
  }
  if (error) {
    return (
      <p role="alert" className="container mx-auto px-4 py-16 text-center text-destructive">
        {error}
      </p>
    );
  }
  if (!fulfillment) {
    return <p className="container mx-auto px-4 py-16 text-center text-muted-foreground">Loading cards…</p>;
  }

  const cards = fulfillment.items.filter((i) => i.greeting_message);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Greeting cards</h1>
          <p className="text-sm text-muted-foreground">
            For {fulfillment.recipient_name}, {fulfillment.city_name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/vendor/orders" className="text-sm text-link hover:underline">
            ← Orders
          </Link>
          {cards.length > 0 && (
            <Button type="button" size="sm" className="gap-2" onClick={() => window.print()}>
              <Printer aria-hidden className="h-4 w-4" />
              Print
            </Button>
          )}
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="text-center text-muted-foreground">This order has no card messages.</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 print:grid-cols-2">
          {cards.map((item, n) => (
            <li key={n} className="break-inside-avoid space-y-2">
              <p className="text-xs text-muted-foreground print:hidden">
                {item.product_name}
                {item.variant_name ? ` (${item.variant_name})` : ""}
              </p>
              <CardPreview message={item.greeting_message ?? ""} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

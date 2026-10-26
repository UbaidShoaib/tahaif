"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import {
  NEXT_STATUS,
  vendorApi,
  type FulfillmentStatus,
  type VendorFulfillmentRead,
} from "@/lib/vendor";
import { zonedNow } from "@/lib/delivery";
import { PAKISTAN_TZ } from "@/lib/datetime";
import { usePolling } from "@/hooks/use-polling";
import { Button } from "@/components/ui/button";

/** What the one big button says for each next step, in kitchen words. */
const ACTION: Partial<Record<FulfillmentStatus, string>> = {
  preparing: "Start preparing",
  ready: "Mark prepared",
  dispatched: "Hand to rider",
  out_for_delivery: "Out for delivery",
};

const NO_SLOT = "Any time today";
const slotTitle = (slot: string) => (slot === NO_SLOT ? slot : `${slot} slot`);

/**
 * Layout decision (vendor A, today's queue): today's orders grouped by
 * delivery slot, each with one big button for its next step. Delivery itself
 * is confirmed with a photo on the Orders page.
 */
export function TodayQueue({ token }: { token: string }) {
  const [items, setItems] = useState<VendorFulfillmentRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const today = zonedNow(PAKISTAN_TZ).date;

  const load = useCallback(() => {
    vendorApi
      .listFulfillments(token)
      .then((all) => {
        setItems(all.filter((f) => f.delivery_date === today));
        setError(null);
      })
      .catch(() => setError("Couldn't load today's orders."));
  }, [token, today]);

  useEffect(load, [load]);
  usePolling(load, updating === null, 30_000);

  const advance = async (f: VendorFulfillmentRead, next: FulfillmentStatus) => {
    setUpdating(f.id);
    setRowError(({ [f.id]: _, ...rest }) => rest);
    try {
      const updated = await vendorApi.updateFulfillment(f.id, { status: next }, token);
      setItems((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
    } catch (err) {
      setRowError((prev) => ({ ...prev, [f.id]: err instanceof Error ? err.message : "Couldn't update this order" }));
    } finally {
      setUpdating(null);
    }
  };

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (items === null) return <p className="text-muted-foreground">Loading today&apos;s orders…</p>;

  const count = (statuses: FulfillmentStatus[]) => items.filter((f) => statuses.includes(f.status)).length;
  const kpis = [
    { label: "Orders today", value: items.length },
    { label: "To prepare", value: count(["pending", "preparing"]) },
    { label: "Ready for rider", value: count(["ready"]) },
    { label: "Delivered", value: count(["delivered"]) },
  ];

  // Slots in time order ("10–1" before "3–6"), anything without a slot last.
  const slots = [...new Set(items.map((f) => f.delivery_slot ?? NO_SLOT))].sort((a, b) =>
    a === NO_SLOT ? 1 : b === NO_SLOT ? -1 : a.localeCompare(b, undefined, { numeric: true }),
  );

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl bg-background-alt p-4">
            <dt className="text-xs text-muted-foreground">{k.label}</dt>
            <dd className="font-display text-2xl tabular-nums">{k.value}</dd>
          </div>
        ))}
      </dl>

      {items.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          Nothing to deliver today.{" "}
          <Link href="/vendor/orders" className="text-link hover:underline">
            See all orders
          </Link>
        </p>
      ) : (
        slots.map((slot) => (
          <section key={slot} aria-label={slotTitle(slot)} className="space-y-3">
            <h2 className="font-display text-lg">{slotTitle(slot)}</h2>
            <ul className="space-y-3">
              {items
                .filter((f) => (f.delivery_slot ?? NO_SLOT) === slot)
                .map((f) => {
                  const next = NEXT_STATUS[f.status];
                  const awaitingPayment = f.payment_method !== "cod" && f.order_status === "pending_payment";
                  const card = f.items.find((i) => i.greeting_message)?.greeting_message;
                  return (
                    <li key={f.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1 space-y-1 text-sm">
                        <p className="font-semibold">
                          {f.items.map((i) => `${i.product_name}${i.variant_name ? ` ${i.variant_name}` : ""}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}
                        </p>
                        <p className="text-muted-foreground">
                          for {f.recipient_name}, {f.address_line1}
                          {f.surprise && <span className="ms-2 font-medium text-gold-ink">Surprise</span>}
                        </p>
                        {card && (
                          <p className="text-muted-foreground">
                            Card: “{card.length > 60 ? `${card.slice(0, 60)}…` : card}” ·{" "}
                            <Link href={`/vendor/orders/${f.id}/cards`} className="inline-flex items-center gap-1 text-link hover:underline">
                              <Printer aria-hidden className="h-3.5 w-3.5" />
                              Print card
                            </Link>
                          </p>
                        )}
                        {rowError[f.id] && (
                          <p role="alert" className="text-destructive">
                            {rowError[f.id]}
                          </p>
                        )}
                      </div>
                      {awaitingPayment && next ? (
                        <span className="text-sm font-medium text-warning">Awaiting payment</span>
                      ) : next === "delivered" ? (
                        <Button asChild size="lg" variant="outline" className="sm:w-48">
                          <Link href="/vendor/orders">Confirm delivery</Link>
                        </Button>
                      ) : next ? (
                        <Button
                          size="lg"
                          className="sm:w-48"
                          loading={updating === f.id}
                          onClick={() => void advance(f, next)}
                        >
                          {ACTION[next]}
                        </Button>
                      ) : (
                        <span className="text-sm font-medium text-success">
                          {f.status === "delivered" ? "Delivered" : "Closed"}
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

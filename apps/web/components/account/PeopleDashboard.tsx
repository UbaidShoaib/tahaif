"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift, Plus, Star } from "lucide-react";
import { accountApi, type AddressRead } from "@/lib/account";
import { cartApi, type OrderRead } from "@/lib/cart";
import { loyaltyApi } from "@/lib/loyalty";
import { formatDaysUntil, nextOccasion, UPCOMING_DAYS } from "@/lib/occasions";
import { orderNumber } from "@/lib/orders";
import { zonedNow } from "@/lib/delivery";
import { viewerTimeZone } from "@/lib/datetime";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";

const OCCASION_SLUG = { birthday: "birthday", anniversary: "anniversary" } as const;
const RECENT_ORDERS = 3;

/**
 * Layout decision (account B, people-first): the people the buyer sends to,
 * soonest occasion first, each with one "send a gift" action; recent orders
 * and points below. With nobody saved yet it leads with the orders instead
 * (option C) and invites them to add someone.
 */
export function PeopleDashboard({ token, firstName }: { token: string; firstName: string | null }) {
  const [people, setPeople] = useState<AddressRead[] | null>(null);
  const [orders, setOrders] = useState<OrderRead[]>([]);
  const [points, setPoints] = useState<number | null>(null);

  // Each part is optional: a failure just leaves that part out.
  useEffect(() => {
    accountApi.listAddresses(token).then(setPeople).catch(() => setPeople([]));
    cartApi.myOrders(token).then(setOrders).catch(() => setOrders([]));
    loyaltyApi.getWallet(token).then((w) => setPoints(w.balance_points)).catch(() => setPoints(null));
  }, [token]);

  const today = zonedNow(viewerTimeZone() ?? "Asia/Karachi").date;
  const lastSentTo = (name: string) =>
    orders.find((o) => o.fulfillments.some((f) => f.recipient_name.toLowerCase() === name.toLowerCase()));
  const sorted = (people ?? [])
    .map((p) => ({ person: p, next: nextOccasion(p, today) }))
    .sort((a, b) => (a.next?.days ?? Infinity) - (b.next?.days ?? Infinity));

  const ordersSection = (
    <section aria-labelledby="recent-orders-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="recent-orders-heading" className="font-display text-xl">
          Recent orders
        </h2>
        <Link href="/account/orders" className="text-sm font-medium text-link hover:underline">
          All orders
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {orders.slice(0, RECENT_ORDERS).map((o) => (
            <li key={o.id}>
              <Link
                href={`/track/${o.public_token}`}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-muted/50"
              >
                <span>
                  <span className="font-mono">{orderNumber(o.public_token)}</span>
                  {o.fulfillments[0] && <> · {o.fulfillments[0].recipient_name}</>}
                </span>
                <span className="flex items-center gap-3">
                  <OrderStatusBadge status={o.status} />
                  <span className="tabular-nums">{formatPrice(o.total_pkr)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-h1">{firstName ? `Hi ${firstName}` : "Your account"}</h1>
        {points !== null && points > 0 && (
          <Link
            href="/account/loyalty"
            className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-sm font-medium text-gold-ink"
          >
            <Star aria-hidden className="h-4 w-4" />
            {points} points
          </Link>
        )}
      </div>

      {people !== null && people.length === 0 && ordersSection}

      {people !== null && (
        <section aria-labelledby="people-heading" className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="people-heading" className="font-display text-xl">
              Your people
            </h2>
            <Link href="/account/addresses" className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline">
              <Plus aria-hidden className="h-4 w-4" />
              Add someone
            </Link>
          </div>
          {people.length === 0 ? (
            <p className="rounded-xl bg-background-alt p-4 text-sm text-muted-foreground">
              Save the people you send to, with their birthdays, and we&apos;ll remind you a week before.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map(({ person, next }) => {
                const soon = next !== null && next.days <= UPCOMING_DAYS;
                const last = lastSentTo(person.recipient_name);
                const label = person.relationship || person.recipient_name;
                return (
                  <li
                    key={person.id}
                    className={`flex flex-col gap-2 rounded-xl border p-4 ${soon ? "border-primary-700 bg-primary-soft" : ""}`}
                  >
                    <p className="font-semibold">
                      {label} <span className="font-normal text-muted-foreground">· {person.city_name}</span>
                    </p>
                    <p className={`text-sm ${soon ? "font-medium text-primary-soft-foreground" : "text-muted-foreground"}`}>
                      {next
                        ? `${next.kind === "birthday" ? "Birthday" : "Anniversary"} ${formatDaysUntil(next.days)}`
                        : "No dates saved"}
                    </p>
                    {last && (
                      <p className="text-xs text-muted-foreground">
                        Last sent: {last.items.map((i) => i.product_name).join(", ")}
                      </p>
                    )}
                    <Button asChild size="sm" variant={soon ? "default" : "outline"} className="mt-auto w-full gap-1.5">
                      <Link
                        href={`/send/${person.id}${soon && next ? `?occasion=${OCCASION_SLUG[next.kind]}` : ""}`}
                        aria-label={`Send ${label} a gift`}
                      >
                        <Gift aria-hidden className="h-4 w-4" />
                        {soon ? "Send a gift" : last ? "Send again" : "Send a gift"}
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {people !== null && people.length > 0 && ordersSection}
    </div>
  );
}

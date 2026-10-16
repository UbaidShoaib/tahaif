"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { cartApi, type OrderRead } from "@/lib/cart";
import Image from "next/image";
import { ChevronRight, Gift, Package } from "lucide-react";
import { isOptimizable } from "@/lib/image-hosts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { isOrderLive, orderNumber, orderRowStatus } from "@/lib/orders";
import { usePolling } from "@/hooks/use-polling";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function OrdersPage() {
  const { accessToken, isLoading: authLoading } = useAuthStore();
  const [orders, setOrders] = useState<OrderRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!accessToken) {
      setLoading(false);
      return;
    }
    cartApi
      .myOrders(accessToken)
      .then(setOrders)
      .catch(() => setError("Failed to load orders. Please try again."))
      .finally(() => setLoading(false));
  }, [accessToken, authLoading]);

  // Keep statuses current while any order is still moving; errors keep the last good list.
  usePolling(
    () => {
      if (accessToken) cartApi.myOrders(accessToken).then(setOrders).catch(() => {});
    },
    !!accessToken && orders.some((o) => isOrderLive(o.status)),
  );

  if (authLoading || loading) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-h1">My orders</h1>
        <ul aria-busy="true" aria-label="Loading your orders" className="divide-y border-y">
          {[1, 2, 3].map((n) => (
            <li key={n} className="flex items-center gap-4 py-4">
              <Skeleton className="h-16 w-16 shrink-0 rounded-lg sm:h-20 sm:w-20" />
              <span className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={Package}
          as="h1"
          title="Sign in to see your orders"
          description="Ordered as a guest? Use the tracking link from your confirmation email."
          action={
            <Button asChild>
              <Link href="/login?callbackUrl=/account/orders">Sign in</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16">
        <EmptyState
          as="h1"
          title="We couldn't load your orders"
          description={error}
          action={
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-h1">My orders</h1>

      {orders.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="No orders yet"
          description="When you send a gift, you'll be able to follow it here."
          action={
            <Button asChild>
              <Link href="/search">Find a gift</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y border-y">
          {orders.map((order) => {
            const [first, ...rest] = order.items;
            const recipients = new Set(order.fulfillments.map((f) => f.recipient_name));
            const recipient = recipients.size === 1 ? order.fulfillments[0]?.recipient_name : null;
            const delivered = order.fulfillments.find((f) => f.delivered_at);
            const live = isOrderLive(order.status);
            const settledBadly = ["cancelled", "refunded", "on_hold"].includes(order.status);
            const title = first
              ? `${first.product_name}${rest.length > 0 ? ` + ${rest.length} more` : ""}`
              : "Your gift";

            return (
              <li key={order.id}>
                {/* The whole row opens the order; one link, so it's one tab stop */}
                <Link
                  href={`/track/${order.public_token}`}
                  className="group flex items-center gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-5"
                >
                  <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-20 sm:w-20">
                    {first?.product_image_url ? (
                      <Image
                        src={first.product_image_url}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
                        unoptimized={!isOptimizable(first.product_image_url)}
                      />
                    ) : (
                      <Gift aria-hidden className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-medium group-hover:text-link">
                      {title}
                      {recipient && <span className="font-normal text-muted-foreground"> for {recipient}</span>}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 flex items-center gap-1.5 text-sm",
                        live ? "font-medium text-foreground" : "text-muted-foreground",
                        settledBadly && "text-destructive",
                      )}
                    >
                      {live && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-gold" />}
                      {orderRowStatus(
                        order.status,
                        order.fulfillments[0]?.delivery_date ?? null,
                        delivered?.delivered_at ?? null,
                        delivered?.city_timezone ?? undefined,
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDate(order.placed_at)} · {formatMoney(order.total_pkr, "PKR")} ·{" "}
                      <span className="font-mono">{orderNumber(order.public_token)}</span>
                    </span>
                  </span>

                  <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { cartApi, type OrderRead } from "@/lib/cart";
import { Gift, Package } from "lucide-react";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { orderNumber } from "@/lib/orders";

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

  if (authLoading || loading) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-h1">My orders</h1>
        <ul aria-busy="true" aria-label="Loading your orders" className="space-y-4">
          {[1, 2, 3].map((n) => (
            <li key={n} className="space-y-2 rounded-xl border p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-24" />
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
        <ul className="space-y-4">
          {orders.map((order) => {
            const itemCount = order.items.reduce((sum, i) => sum + i.qty, 0);
            const recipient = order.fulfillments[0]?.recipient_name;

            return (
              <li
                key={order.id}
                className="border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-primary-700 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <OrderStatusBadge status={order.status} />
                    <span className="text-xs text-muted-foreground">
                      {formatDate(order.placed_at)} · <span className="font-mono">{orderNumber(order.public_token)}</span>
                    </span>
                  </div>

                  <p className="text-sm font-medium truncate">
                    {itemCount} item{itemCount !== 1 ? "s" : ""}
                    {recipient ? ` · For ${recipient}` : ""}
                  </p>

                  <p className="text-base font-semibold mt-1">
                    {formatMoney(order.total_pkr, "PKR")}
                  </p>
                </div>

                <Link
                  href={`/track/${order.public_token}`}
                  className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-link hover:underline"
                >
                  Track order<span className="sr-only"> {orderNumber(order.public_token)}</span>
                  <span aria-hidden>&nbsp;→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

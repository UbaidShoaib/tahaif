"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import { cartApi, type OrderRead } from "@/lib/cart";

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pending Payment",
  paid: "Paid",
  preparing: "Preparing",
  dispatched: "Dispatched",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  on_hold: "On Hold",
};

const STATUS_COLORS: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  paid: "bg-blue-100 text-blue-800",
  preparing: "bg-purple-100 text-purple-800",
  dispatched: "bg-indigo-100 text-indigo-800",
  out_for_delivery: "bg-orange-100 text-orange-800",
  delivered: "bg-green-100 text-green-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
  on_hold: "bg-yellow-100 text-yellow-700",
};

function formatPKR(paisa: number) {
  return `PKR ${(paisa / 100).toLocaleString("en-PK", { minimumFractionDigits: 0 })}`;
}

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
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Loading your orders…</p>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">My Orders</h1>
        <p className="text-muted-foreground mb-6">
          Please sign in to view your orders.
        </p>
        <Link
          href="/login"
          className="inline-block bg-[#16a34a] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#15803d] transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>

      {orders.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-6">
            You haven&apos;t placed any orders yet.
          </p>
          <Link
            href="/"
            className="inline-block bg-[#16a34a] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#15803d] transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => {
            const itemCount = order.items.reduce((sum, i) => sum + i.qty, 0);
            const recipient = order.fulfillments[0]?.recipient_name;
            const label = STATUS_LABELS[order.status] ?? order.status;
            const color =
              STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700";

            return (
              <li
                key={order.id}
                className="border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-[#16a34a] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}
                    >
                      {label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(order.placed_at)}
                    </span>
                  </div>

                  <p className="text-sm font-medium truncate">
                    {itemCount} item{itemCount !== 1 ? "s" : ""}
                    {recipient ? ` · For ${recipient}` : ""}
                  </p>

                  <p className="text-base font-semibold mt-1">
                    {formatPKR(order.total_pkr)}
                  </p>
                </div>

                <Link
                  href={`/track/${order.public_token}`}
                  className="shrink-0 text-sm font-medium text-[#16a34a] hover:underline"
                >
                  Track Order →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

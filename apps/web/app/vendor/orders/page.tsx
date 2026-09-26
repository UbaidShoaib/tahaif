"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import {
  vendorApi,
  type FulfillmentStatus,
  type VendorFulfillmentRead,
} from "@/lib/vendor";
import { OrderStatusBadge, statusLabel } from "@/components/orders/OrderStatusBadge";

const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  "pending",
  "preparing",
  "ready",
  "dispatched",
  "out_for_delivery",
  "delivered",
  "failed",
];

// Button wording for moving a fulfilment to its next status.
const ACTION_LABELS: Record<FulfillmentStatus, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  dispatched: "Dispatched",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
};

const NEXT_STATUS: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  pending: "preparing",
  preparing: "ready",
  ready: "dispatched",
  dispatched: "out_for_delivery",
  out_for_delivery: "delivered",
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

export default function VendorOrdersPage() {
  const { accessToken, isLoading: authLoading } = useAuthStore();
  const [fulfillments, setFulfillments] = useState<VendorFulfillmentRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FulfillmentStatus | "">("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = useCallback(
    (token: string) => {
      setLoading(true);
      vendorApi
        .listFulfillments(token, filterStatus || undefined)
        .then(setFulfillments)
        .catch(() => setError("Failed to load fulfillments."))
        .finally(() => setLoading(false));
    },
    [filterStatus],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!accessToken) {
      setLoading(false);
      return;
    }
    load(accessToken);
  }, [accessToken, authLoading, load]);

  const advance = async (f: VendorFulfillmentRead) => {
    if (!accessToken) return;
    const next = NEXT_STATUS[f.status];
    if (!next) return;
    setUpdating(f.id);
    setRowError((prev) => {
      const copy = { ...prev };
      delete copy[f.id];
      return copy;
    });
    try {
      const updated = await vendorApi.updateFulfillment(f.id, { status: next }, accessToken);
      setFulfillments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update this fulfillment";
      setRowError((prev) => ({ ...prev, [f.id]: msg }));
    } finally {
      setUpdating(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Loading fulfillments…</p>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-6">Please sign in to view your fulfillments.</p>
        <Link href="/login" className="text-sm text-link hover:underline">
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
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Fulfillments</h1>
        <Link href="/vendor/dashboard" className="text-sm text-link hover:underline">
          ← Dashboard
        </Link>
      </div>

      <div className="mb-5">
        <label htmlFor="status-filter" className="text-sm font-medium me-3">
          Filter by status:
        </label>
        <select
          id="status-filter"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FulfillmentStatus | "")}
          className="text-sm border rounded-lg px-3 py-1.5 bg-background"
        >
          <option value="">All</option>
          {FULFILLMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s, "fulfillment")}
            </option>
          ))}
        </select>
      </div>

      {fulfillments.length === 0 ? (
        <p className="text-muted-foreground text-center py-16">No fulfillments found.</p>
      ) : (
        <ul className="space-y-4">
          {fulfillments.map((f) => {
            const nextStatus = NEXT_STATUS[f.status];
            const isUpdating = updating === f.id;
            // Only COD orders may be prepared before payment is verified.
            const awaitingPayment = f.payment_method !== "cod" && f.order_status === "pending_payment";

            return (
              <li
                key={f.id}
                className="border rounded-xl p-5 hover:border-primary-700 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <OrderStatusBadge status={f.status} kind="fulfillment" />
                    <span className="ms-3 text-xs text-muted-foreground">
                      Deliver by {formatDate(f.delivery_date)}
                    </span>
                  </div>

                  {nextStatus && awaitingPayment && (
                    <span className="text-xs font-medium text-warning">
                      Awaiting payment
                    </span>
                  )}
                  {nextStatus && !awaitingPayment && (
                    <button
                      onClick={() => { void advance(f); }}
                      disabled={isUpdating}
                      className="text-xs font-medium bg-primary-700 text-white px-3 py-1 rounded-lg hover:bg-primary-800 disabled:opacity-50 transition-colors"
                    >
                      {isUpdating ? "Updating…" : `Mark ${ACTION_LABELS[nextStatus]}`}
                    </button>
                  )}
                </div>
                {rowError[f.id] && (
                  <p role="alert" className="mb-3 text-sm text-destructive">{rowError[f.id]}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Recipient: </span>
                    <span className="font-medium">{f.recipient_name}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Phone: </span>
                    {f.recipient_phone}
                  </p>
                  <p className="sm:col-span-2">
                    <span className="text-muted-foreground">Address: </span>
                    {f.address_line1}
                    {f.address_line2 ? `, ${f.address_line2}` : ""} · {f.city_name}
                  </p>
                  {f.landmark && (
                    <p className="sm:col-span-2">
                      <span className="text-muted-foreground">Landmark: </span>
                      {f.landmark}
                    </p>
                  )}
                  <p>
                    <span className="text-muted-foreground">Items: </span>
                    {f.item_count}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Subtotal: </span>
                    {formatPKR(f.subtotal_pkr)}
                  </p>
                  {f.courier_tracking && (
                    <p className="sm:col-span-2">
                      <span className="text-muted-foreground">Tracking: </span>
                      {f.courier_tracking}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

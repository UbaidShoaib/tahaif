"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth.store";
import {
  vendorApi,
  type FulfillmentStatus,
  type VendorFulfillmentRead,
} from "@/lib/vendor";

const STATUS_LABELS: Record<FulfillmentStatus, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  dispatched: "Dispatched",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
};

const STATUS_COLORS: Record<FulfillmentStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  preparing: "bg-purple-100 text-purple-800",
  ready: "bg-blue-100 text-blue-800",
  dispatched: "bg-indigo-100 text-indigo-800",
  out_for_delivery: "bg-orange-100 text-orange-800",
  delivered: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
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
    try {
      const updated = await vendorApi.updateFulfillment(f.id, { status: next }, accessToken);
      setFulfillments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch {
      // noop — keep existing state
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
        <Link href="/login" className="text-sm text-[#16a34a] hover:underline">
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
        <Link href="/vendor/dashboard" className="text-sm text-[#16a34a] hover:underline">
          ← Dashboard
        </Link>
      </div>

      <div className="mb-5">
        <label htmlFor="status-filter" className="text-sm font-medium mr-3">
          Filter by status:
        </label>
        <select
          id="status-filter"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FulfillmentStatus | "")}
          className="text-sm border rounded-lg px-3 py-1.5 bg-background"
        >
          <option value="">All</option>
          {(Object.keys(STATUS_LABELS) as FulfillmentStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {fulfillments.length === 0 ? (
        <p className="text-muted-foreground text-center py-16">No fulfillments found.</p>
      ) : (
        <ul className="space-y-4">
          {fulfillments.map((f) => {
            const colorClass = STATUS_COLORS[f.status] ?? "bg-gray-100 text-gray-700";
            const nextStatus = NEXT_STATUS[f.status];
            const isUpdating = updating === f.id;

            return (
              <li
                key={f.id}
                className="border rounded-xl p-5 hover:border-[#16a34a] transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
                      {STATUS_LABELS[f.status]}
                    </span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      Deliver by {formatDate(f.delivery_date)}
                    </span>
                  </div>

                  {nextStatus && (
                    <button
                      onClick={() => { void advance(f); }}
                      disabled={isUpdating}
                      className="text-xs font-medium bg-[#16a34a] text-white px-3 py-1 rounded-lg hover:bg-[#15803d] disabled:opacity-50 transition-colors"
                    >
                      {isUpdating ? "Updating…" : `Mark ${STATUS_LABELS[nextStatus]}`}
                    </button>
                  )}
                </div>

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

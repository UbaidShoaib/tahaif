"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, CheckCircle, XCircle, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores/auth.store";
import { formatPrice } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

interface OrderSummary {
  id: string;
  public_token: string;
  status: string;
  user_id: string | null;
  total_pkr: number;
  currency: string;
  placed_at: string;
  payment_method: string | null;
  payment_status: string | null;
  proof_url: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  preparing: "bg-blue-100 text-blue-800",
  dispatched: "bg-purple-100 text-purple-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

const ORDER_STATUSES = [
  "pending_payment", "paid", "preparing", "dispatched",
  "out_for_delivery", "delivered", "completed", "cancelled", "on_hold",
];

export default function AdminDashboard() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    if (user.role !== "admin" && user.role !== "staff") {
      router.push("/"); return;
    }
    void fetchOrders();
  }, [user, filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchOrders() {
    setLoading(true);
    setError(null);
    try {
      const qs = filterStatus ? `?status=${filterStatus}` : "";
      const resp = await fetch(`${API_URL}/admin/orders${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Failed to fetch orders");
      setOrders(await resp.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(orderId: string, status: string) {
    setActionInProgress(orderId);
    try {
      await fetch(`${API_URL}/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await fetchOrders();
    } finally {
      setActionInProgress(null);
    }
  }

  async function verifyPayment(orderId: string, verified: boolean) {
    setActionInProgress(orderId);
    try {
      await fetch(`${API_URL}/admin/orders/${orderId}/verify-payment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ verified }),
      });
      await fetchOrders();
    } finally {
      setActionInProgress(null);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6 text-primary-600" />
          Admin Dashboard
        </h1>
        <Button variant="outline" size="sm" onClick={() => void fetchOrders()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button
          variant={filterStatus === "" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterStatus("")}
        >
          All
        </Button>
        {ORDER_STATUSES.map((s) => (
          <Button
            key={s}
            variant={filterStatus === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus(s)}
            className="capitalize"
          >
            {s.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      <Separator className="mb-6" />

      {error && (
        <div className="rounded-lg bg-destructive/10 text-destructive text-sm p-3 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="text-muted-foreground text-sm">No orders found.</div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="font-mono text-xs text-muted-foreground">#{order.public_token.slice(0, 8).toUpperCase()}</p>
                  <p className="font-semibold">{formatPrice(order.total_pkr)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.placed_at).toLocaleString("en-PK")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[order.status] ?? "bg-muted"}`}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                  {order.payment_status && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">
                      {order.payment_status.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Status update */}
                <select
                  className="text-xs border rounded px-2 py-1"
                  value={order.status}
                  onChange={(e) => void updateStatus(order.id, e.target.value)}
                  disabled={actionInProgress === order.id}
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>

                {/* Proof verification */}
                {order.payment_status === "awaiting_verification" && (
                  <>
                    {order.proof_url && (
                      <Button size="sm" variant="outline" asChild className="gap-1">
                        <a href={order.proof_url} target="_blank" rel="noopener noreferrer">
                          <Eye className="h-3 w-3" /> View Proof
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                      disabled={actionInProgress === order.id}
                      onClick={() => void verifyPayment(order.id, true)}
                    >
                      <CheckCircle className="h-3 w-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1"
                      disabled={actionInProgress === order.id}
                      onClick={() => void verifyPayment(order.id, false)}
                    >
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  </>
                )}

                <Button size="sm" variant="ghost" asChild>
                  <a href={`/track/${order.public_token}`} target="_blank" rel="noopener noreferrer">
                    Track
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

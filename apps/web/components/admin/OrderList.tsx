"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Eye, RefreshCw, Search, XCircle } from "lucide-react";
import { WhatsAppMessages } from "@/components/admin/WhatsAppMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { usePolling } from "@/hooks/use-polling";
import { apiFetch, ApiError } from "@/lib/api";
import { SOURCE_LABELS } from "@/lib/social-orders";
import { formatPrice } from "@/lib/utils";

export interface OrderSummary {
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
  source: string;
  buyer_name: string | null;
  buyer_phone: string | null;
  recipients: string[];
  delivery_date: string | null;
  customer_confirmed_at: string | null;
}

interface OrderPage {
  items: OrderSummary[];
  total: number;
  offset: number;
  limit: number;
}

export type OrderFilters = { status: string; q: string; from: string; to: string; offset: number };

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

export const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 300;

export function ordersQuery(f: OrderFilters): string {
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status);
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.from) params.set("placed_from", f.from);
  if (f.to) params.set("placed_to", f.to);
  if (f.offset) params.set("offset", String(f.offset));
  params.set("limit", String(PAGE_SIZE));
  return `/admin/orders?${params.toString()}`;
}

/** The code printed on receipts and said on the phone. */
export const orderCode = (publicToken: string) => publicToken.slice(0, 8).toUpperCase();

const deliveryDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short" });

/**
 * Find any order: by code, a buyer or recipient phone in any format, or a name,
 * narrowed by status and the days it was placed. New orders and payment proofs
 * appear without a refresh.
 */
export function OrderList({ token }: { token: string }) {
  const [filters, setFilters] = useState<OrderFilters>({ status: "", q: "", from: "", to: "", offset: 0 });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<OrderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [openMessages, setOpenMessages] = useState<string | null>(null);

  // Any filter change starts again from the first page.
  const update = (patch: Partial<OrderFilters>) => setFilters((f) => ({ ...f, offset: 0, ...patch }));

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, offset: 0 })), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      setPage(await apiFetch<OrderPage>(ordersQuery(filters), { token }));
    } catch (e) {
      if (!silent) setError(e instanceof ApiError ? e.detail : "Failed to fetch orders");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => { void load(); }, [load]);

  // Paused mid-action so a reload doesn't swap the row being worked on.
  usePolling(() => void load(true), actionInProgress === null, 30_000);

  async function act(orderId: string, path: string, method: string, body: unknown) {
    setActionInProgress(orderId);
    setError(null);
    try {
      await apiFetch(path, { method, token, body });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not update the order.");
    } finally {
      setActionInProgress(null);
    }
  }

  const orders = page?.items ?? [];
  const total = page?.total ?? 0;
  const filtered = !!(filters.status || filters.q || filters.from || filters.to);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-64 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search orders"
            placeholder="Order code, phone or name"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">Placed from</span>
          <Input type="date" className="w-auto" value={filters.from} max={filters.to || undefined}
            onChange={(e) => update({ from: e.target.value })} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">to</span>
          <Input type="date" className="w-auto" value={filters.to} min={filters.from || undefined}
            onChange={(e) => update({ to: e.target.value })} />
        </label>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilters({ status: "", q: "", from: "", to: "", offset: 0 }); }}>
            Clear filters
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
          <RefreshCw aria-hidden className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
        <Button variant={filters.status === "" ? "default" : "outline"} size="sm"
          aria-pressed={filters.status === ""} onClick={() => update({ status: "" })}>
          All
        </Button>
        {ORDER_STATUSES.map((s) => (
          <Button key={s} variant={filters.status === s ? "default" : "outline"} size="sm" className="capitalize"
            aria-pressed={filters.status === s} onClick={() => update({ status: s })}>
            {s.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      <Separator />

      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="text-sm text-muted-foreground">{filtered ? "No orders match." : "No orders found."}</div>
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {filters.offset + 1}–{filters.offset + orders.length} of {total} {total === 1 ? "order" : "orders"}
          </p>
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="font-mono text-xs text-muted-foreground">#{orderCode(order.public_token)}</p>
                    <p className="font-semibold">{formatPrice(order.total_pkr)}</p>
                    {order.recipients.length > 0 && (
                      <p className="text-sm">
                        To {order.recipients.join(", ")}
                        {order.delivery_date && (
                          <span className="text-muted-foreground"> · deliver {deliveryDay(order.delivery_date)}</span>
                        )}
                      </p>
                    )}
                    {(order.buyer_name || order.buyer_phone) && (
                      <p className="text-xs text-muted-foreground">
                        From {[order.buyer_name, order.buyer_phone].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Placed {new Date(order.placed_at).toLocaleString("en-PK")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status] ?? "bg-muted"}`}>
                      {order.status.replace(/_/g, " ")}
                    </span>
                    {order.source !== "web" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {SOURCE_LABELS[order.source] ?? order.source}
                        {order.customer_confirmed_at ? " · confirmed" : " · not confirmed"}
                      </span>
                    )}
                    {order.payment_status && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {order.payment_status.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label={`Status of order ${orderCode(order.public_token)}`}
                    className="rounded border px-2 py-1 text-xs"
                    value={order.status}
                    onChange={(e) => void act(order.id, `/admin/orders/${order.id}/status`, "PATCH", { status: e.target.value })}
                    disabled={actionInProgress === order.id}
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                    ))}
                  </select>

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
                        className="gap-1 bg-success text-white hover:bg-success/90 dark:text-background"
                        disabled={actionInProgress === order.id}
                        onClick={() => void act(order.id, `/admin/orders/${order.id}/verify-payment`, "POST", { verified: true })}
                      >
                        <CheckCircle className="h-3 w-3" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        disabled={actionInProgress === order.id}
                        onClick={() => void act(order.id, `/admin/orders/${order.id}/verify-payment`, "POST", { verified: false })}
                      >
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </>
                  )}

                  {order.buyer_phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-expanded={openMessages === order.id}
                      onClick={() => setOpenMessages(openMessages === order.id ? null : order.id)}
                    >
                      WhatsApp
                    </Button>
                  )}

                  <Button size="sm" variant="ghost" asChild>
                    <a href={`/track/${order.public_token}`} target="_blank" rel="noopener noreferrer">
                      Track
                    </a>
                  </Button>
                </div>
                {openMessages === order.id && <WhatsAppMessages orderId={order.id} token={token} />}
              </div>
            ))}
          </div>
          {total > PAGE_SIZE && (
            <nav aria-label="Order pages" className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={filters.offset === 0}
                onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - PAGE_SIZE) }))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={filters.offset + PAGE_SIZE >= total}
                onClick={() => setFilters((f) => ({ ...f, offset: f.offset + PAGE_SIZE }))}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

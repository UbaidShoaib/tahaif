"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";

type Entry = {
  id: string;
  at: string;
  action: string;
  label: string;
  entity: string;
  entity_id: string | null;
  actor_name: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip_address: string | null;
};

type Page = { items: Entry[]; total: number; offset: number; limit: number };

const ENTITIES = [
  { key: "", label: "Everything" },
  { key: "order", label: "Orders" },
  { key: "product", label: "Products" },
  { key: "vendor", label: "Shops" },
  { key: "coupon", label: "Coupons" },
  { key: "fx_rate", label: "Exchange rates" },
  { key: "user", label: "Users" },
];

export const PAGE_SIZE = 50;

/** Where an entry's subject can be opened in the admin, if anywhere. */
export function entityHref(entity: string, id: string | null): string | null {
  if (!id) return null;
  if (entity === "order") return `/admin/orders/${id}`;
  if (entity === "product") return `/admin/products/${id}`;
  return null;
}

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).replace(/_/g, " ");
};

/** "price: 250000 → 300000" for each changed field; context-only fields show their value. */
export function changes(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys.map((k) => {
    const label = k.replace(/_/g, " ");
    if (before && k in before) return `${label}: ${show(before[k])} → ${show(after?.[k])}`;
    return `${label}: ${show(after?.[k])}`;
  });
}

/**
 * Who changed what in the back office, newest first. Admins only — it includes
 * every staff member's actions and IP addresses.
 */
export function ActivityLog({ token }: { token: string }) {
  const [entity, setEntity] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (entity) params.set("entity", entity);
    if (offset) params.set("offset", String(offset));
    try {
      setPage(await apiFetch<Page>(`/admin/audit-log?${params.toString()}`, { token }));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not load the activity log.");
    }
  }, [token, entity, offset]);

  useEffect(() => { void load(); }, [load]);

  const items = page?.items ?? [];
  const total = page?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select aria-label="Show" className="w-auto" value={entity}
          onChange={(e) => { setEntity(e.target.value); setOffset(0); }}>
          {ENTITIES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </Select>
        {page && <p role="status" className="text-sm text-muted-foreground">{total} {total === 1 ? "entry" : "entries"}</p>}
      </div>

      {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {!page && !error ? (
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {items.map((e) => {
            const href = entityHref(e.entity, e.entity_id);
            return (
              <li key={e.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>
                    <span className="font-medium">{e.actor_name ?? "System"}</span> · {e.label}
                    {href && (
                      <> · <Link href={href} className="text-link hover:underline">open</Link></>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}
                    {e.ip_address && ` · ${e.ip_address}`}
                  </p>
                </div>
                {changes(e.before, e.after).map((c) => (
                  <p key={c} className="break-words text-xs text-muted-foreground">{c}</p>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <nav aria-label="Activity pages" className="flex justify-between">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
            Newer
          </Button>
          <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
            Older
          </Button>
        </nav>
      )}
    </div>
  );
}

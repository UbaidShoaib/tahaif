"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Pencil, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  vendor_name: string;
  base_price_pkr: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  image_url: string | null;
};

type Vendor = { id: string; name: string };
type Visibility = "all" | "live" | "hidden";

const VISIBILITY: { key: Visibility; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "hidden", label: "Hidden" },
];

const SEARCH_DELAY_MS = 300;

export function productsQuery(visibility: Visibility, q: string, vendorId: string): string {
  const params = new URLSearchParams();
  if (visibility !== "all") params.set("is_active", String(visibility === "live"));
  if (q.trim()) params.set("q", q.trim());
  if (vendorId) params.set("vendor_id", vendorId);
  const qs = params.toString();
  return `/admin/products${qs ? `?${qs}` : ""}`;
}

/**
 * The whole catalog, live and hidden: find a product by name, filter by shop,
 * publish or hide it, and open it in the editor. Hidden is where new vendor
 * listings wait to be published.
 */
export function ProductList({ token }: { token: string }) {
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [visibility, setVisibility] = useState<Visibility>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Vendor[]>("/vendors", { token }).then(setVendors).catch(() => setVendors([]));
  }, [token]);

  // Wait for a pause in typing so each keystroke isn't a request.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiFetch<AdminProduct[]>(productsQuery(visibility, query, vendorId), { token }));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [token, visibility, query, vendorId]);

  useEffect(() => { void load(); }, [load]);

  async function setActive(p: AdminProduct, isActive: boolean) {
    setBusy(p.id);
    setError(null);
    try {
      await apiFetch(`/admin/products/${p.id}/active`, { method: "PATCH", token, body: { is_active: isActive } });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : `Could not ${isActive ? "publish" : "hide"} the product.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search products"
            placeholder="Search by name"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select aria-label="Shop" className="w-auto" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">All shops</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <div role="group" aria-label="Visibility" className="flex gap-1">
          {VISIBILITY.map((v) => (
            <Button
              key={v.key}
              size="sm"
              variant={visibility === v.key ? "default" : "outline"}
              aria-pressed={visibility === v.key}
              onClick={() => setVisibility(v.key)}
            >
              {v.label}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading products…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {visibility === "hidden" && !query && !vendorId
            ? "No hidden products. Everything in the catalog is live."
            : "No products match."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- thumbnails from any storage host
                <img src={p.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              ) : (
                <div aria-hidden className="h-12 w-12 shrink-0 rounded-lg bg-muted" />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.vendor_name} · {formatPrice(p.base_price_pkr)}
                </p>
              </div>
              <Badge variant={p.is_active ? "success" : "warning"}>{p.is_active ? "Live" : "Hidden"}</Badge>
              <div className="flex gap-2">
                {p.is_active ? (
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy === p.id}
                    onClick={() => void setActive(p, false)}>
                    <EyeOff aria-hidden className="h-3 w-3" /> Hide
                  </Button>
                ) : (
                  <Button size="sm" className="gap-1" disabled={busy === p.id} onClick={() => void setActive(p, true)}>
                    <Eye aria-hidden className="h-3 w-3" /> Publish
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1" asChild>
                  <Link href={`/admin/products/${p.id}`} aria-label={`Edit ${p.name}`}>
                    <Pencil aria-hidden className="h-3 w-3" /> Edit
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

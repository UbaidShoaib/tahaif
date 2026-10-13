"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  vendor_name: string;
  base_price_pkr: number;
  is_active: boolean;
  created_at: string;
};

/** Products buyers can't see: new vendor listings waiting to be published, and ones taken down. */
export function HiddenProducts({ token }: { token: string }) {
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiFetch<AdminProduct[]>("/admin/products?is_active=false", { token }));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function publish(id: string) {
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/admin/products/${id}/active`, { method: "PATCH", token, body: { is_active: true } });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not publish the product.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading products…</p>;

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hidden products. Everything in the catalog is live.</p>
      ) : (
        rows.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div className="space-y-0.5">
              <p className="font-semibold">{p.name}</p>
              <p className="text-sm text-muted-foreground">
                {p.vendor_name} · {formatPrice(p.base_price_pkr)}
              </p>
              <p className="text-xs text-muted-foreground">
                Added {new Date(p.created_at).toLocaleString("en-PK")}
              </p>
            </div>
            <Button size="sm" className="gap-1" disabled={busy === p.id} onClick={() => void publish(p.id)}>
              <Eye aria-hidden className="h-3 w-3" /> Publish
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

export type Variant = {
  id: string;
  name: string;
  price_delta_pkr: number;
  /** null = made to order, not counted. */
  stock_qty: number | null;
  is_active: boolean;
};

/** A size as typed: rupees and a count as text, blank stock = not counted. */
type Row = { name: string; extra: string; stock: string; on: boolean };

const toRow = (v: Variant): Row => ({
  name: v.name,
  extra: String(Math.round(v.price_delta_pkr / 100)),
  stock: v.stock_qty === null ? "" : String(v.stock_qty),
  on: v.is_active,
});

const EMPTY: Row = { name: "", extra: "0", stock: "", on: true };

/** Rupees that may be negative ("-500" for a smaller size); null when not a whole number. */
export function deltaPaisa(text: string): number | null {
  return /^-?\d+$/.test(text.trim()) ? Number(text.trim()) * 100 : null;
}

/** Blank = not counted; otherwise a whole number ≥ 0. `undefined` = invalid. */
export function stockValue(text: string): number | null | undefined {
  if (!text.trim()) return null;
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined;
}

function check(row: Row): { body: Record<string, unknown> } | { error: string } {
  if (!row.name.trim()) return { error: "Give the size a name, e.g. 2 lb or Dozen." };
  const extra = deltaPaisa(row.extra);
  if (extra === null) return { error: `${row.name}: the extra price must be whole rupees (can be negative).` };
  const stock = stockValue(row.stock);
  if (stock === undefined) return { error: `${row.name}: stock must be a whole number, or blank if you don't count it.` };
  return { body: { name: row.name.trim(), price_delta_pkr: extra, stock_qty: stock, is_active: row.on } };
}

/**
 * Sizes and options with their price and stock. Leave stock blank for things
 * made to order (cakes, bouquets); give a count for boxed goods. Sizes are
 * switched off, never deleted, because past orders point at them.
 */
export function VariantsEditor({
  variants,
  slug,
  token,
  basePrice,
  busy,
  run,
  notice,
  onError,
}: {
  variants: Variant[];
  slug: string;
  token: string;
  basePrice: number;
  busy: boolean;
  run: (work: () => Promise<unknown>, done: string) => Promise<void>;
  notice: ReactNode;
  onError: (text: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [draft, setDraft] = useState<Row>(EMPTY);

  useEffect(() => {
    setRows(Object.fromEntries(variants.map((v) => [v.id, toRow(v)])));
  }, [variants]);

  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  function save(id: string) {
    const result = check(rows[id]);
    if ("error" in result) return onError(result.error);
    void run(() => apiFetch(`/products/${slug}/variants/${id}`, { method: "PATCH", token, body: result.body }),
      `${rows[id].name.trim()} saved.`);
  }

  function add() {
    const result = check(draft);
    if ("error" in result) return onError(result.error);
    void run(() => apiFetch(`/products/${slug}/variants`, { method: "POST", token, body: result.body }),
      `${draft.name.trim()} added.`).then(() => setDraft(EMPTY));
  }

  const fields = (row: Row, onChange: (p: Partial<Row>) => void, label: string) => (
    <>
      <Input aria-label={`${label} name`} placeholder="e.g. 2 lb" maxLength={255} value={row.name}
        onChange={(e) => onChange({ name: e.target.value })} />
      <Input aria-label={`${label} extra price (Rs)`} inputMode="numeric" value={row.extra}
        onChange={(e) => onChange({ extra: e.target.value })} />
      <Input aria-label={`${label} stock`} inputMode="numeric" placeholder="Not counted" value={row.stock}
        onChange={(e) => onChange({ stock: e.target.value })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={row.on} onChange={(e) => onChange({ on: e.target.checked })} /> On sale
      </label>
    </>
  );

  return (
    <section aria-labelledby="variants-heading" className="space-y-4 rounded-xl border p-4">
      <div>
        <h2 id="variants-heading" className="font-semibold">Sizes &amp; stock</h2>
        <p className="text-sm text-muted-foreground">
          The extra price is added to the main price. Leave stock blank for made-to-order items; enter a count for
          boxed goods and it goes down with each order (and back up if an order is cancelled).
        </p>
      </div>

      <div className="hidden grid-cols-[2fr_1fr_1fr_auto_auto] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
        <span>Name</span><span>Extra price (Rs)</span><span>Stock</span><span /><span />
      </div>

      {variants.length === 0 && <p className="text-sm text-muted-foreground">No sizes — buyers get the product as it is.</p>}

      <ul className="space-y-3">
        {variants.map((v) => {
          const row = rows[v.id];
          if (!row) return null;
          return (
            <li key={v.id} className="space-y-1">
              <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[2fr_1fr_1fr_auto_auto]">
                {fields(row, (p) => set(v.id, p), v.name)}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => save(v.id)}>Save</Button>
              </div>
              <p className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
                Sells at {formatPrice(basePrice + v.price_delta_pkr)}
                {!v.is_active && <Badge variant="neutral">Off</Badge>}
                {v.is_active && v.stock_qty === 0 && <Badge variant="error">Sold out</Badge>}
                {v.is_active && v.stock_qty !== null && v.stock_qty > 0 && v.stock_qty <= 5 && (
                  <Badge variant="warning">{v.stock_qty} left</Badge>
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="space-y-2 rounded-lg border border-dashed p-3">
        <p className="text-sm font-medium">Add a size</p>
        <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[2fr_1fr_1fr_auto_auto]">
          {fields(draft, (p) => setDraft((d) => ({ ...d, ...p })), "New size")}
          <Button size="sm" className="gap-1" disabled={busy} onClick={add}>
            <Plus aria-hidden className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>
      {notice}
    </section>
  );
}

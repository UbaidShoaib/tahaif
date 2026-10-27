"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toPaisa } from "@/components/admin/AddProductForm";
import { ActionNotices, errorText, useAdminAction } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  couponsApi,
  couponSummary,
  dayToInstant,
  instantToDay,
  optionalWhole,
  type Coupon,
  type CouponType,
  type CouponWrite,
} from "@/lib/back-office-admin";
import { formatPrice } from "@/lib/utils";

/** The editable part of a coupon, as typed: rupees and whole numbers as text, dates as Pakistan days. */
type Draft = { value: string; minOrder: string; usageLimit: string; perCustomer: string; starts: string; ends: string };

const EMPTY: Draft = { value: "", minOrder: "", usageLimit: "", perCustomer: "", starts: "", ends: "" };

function toDraft(c: Coupon): Draft {
  return {
    value: c.coupon_type === "free_shipping" ? "1" : String(Number(c.value)),
    minOrder: c.min_order_pkr != null ? String(c.min_order_pkr / 100) : "",
    usageLimit: c.usage_limit != null ? String(c.usage_limit) : "",
    perCustomer: c.per_customer_limit != null ? String(c.per_customer_limit) : "",
    starts: instantToDay(c.starts_at),
    ends: instantToDay(c.ends_at),
  };
}

/** The draft as the API wants it, or an error to show. */
function fromDraft(d: Draft, type: CouponType): CouponWrite | string {
  const value = type === "free_shipping" ? "1" : d.value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
    return type === "percent" ? "Enter the percent off, e.g. 10." : "Enter the rupees off, e.g. 500.";
  }
  if (type === "percent" && Number(value) > 100) return "A percent coupon can take at most 100% off.";
  const minOrder = d.minOrder.trim() ? toPaisa(d.minOrder) : null;
  if (d.minOrder.trim() && minOrder === null) return "Enter the smallest order in whole rupees, or leave it blank.";
  const usageLimit = optionalWhole(d.usageLimit, 1);
  const perCustomer = optionalWhole(d.perCustomer, 1);
  if (usageLimit === undefined) return "Total uses must be a whole number of at least 1, or blank.";
  if (perCustomer === undefined) return "Uses per customer must be a whole number of at least 1, or blank.";
  if (d.starts && d.ends && d.ends < d.starts) return "The last day can't be before the first.";
  return {
    value, min_order_pkr: minOrder, usage_limit: usageLimit, per_customer_limit: perCustomer,
    starts_at: dayToInstant(d.starts), ends_at: dayToInstant(d.ends, true),
  };
}

function DraftFields({ draft, type, onChange }: { draft: Draft; type: CouponType; onChange: (d: Draft) => void }) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {type !== "free_shipping" && (
        <FormField label={type === "percent" ? "Percent off" : "Rupees off"} required>
          {(p) => <Input {...p} inputMode="decimal" value={draft.value} onChange={(e) => set({ value: e.target.value })} />}
        </FormField>
      )}
      <FormField label="Smallest order (Rs)" hint="Blank: any order.">
        {(p) => <Input {...p} inputMode="numeric" value={draft.minOrder} onChange={(e) => set({ minOrder: e.target.value })} />}
      </FormField>
      <FormField label="Total uses" hint="Blank: no limit.">
        {(p) => <Input {...p} inputMode="numeric" value={draft.usageLimit} onChange={(e) => set({ usageLimit: e.target.value })} />}
      </FormField>
      <FormField label="Uses per customer" hint="1 for a first-order code.">
        {(p) => <Input {...p} inputMode="numeric" value={draft.perCustomer} onChange={(e) => set({ perCustomer: e.target.value })} />}
      </FormField>
      <FormField label="First day" hint="Pakistan time. Blank: from now.">
        {(p) => <Input {...p} type="date" value={draft.starts} onChange={(e) => set({ starts: e.target.value })} />}
      </FormField>
      <FormField label="Last day" hint="Works until the end of this day.">
        {(p) => <Input {...p} type="date" value={draft.ends} onChange={(e) => set({ ends: e.target.value })} />}
      </FormField>
    </div>
  );
}

function rules(c: Coupon): string {
  const parts = [couponSummary(c)];
  if (c.min_order_pkr) parts.push(`orders over ${formatPrice(c.min_order_pkr)}`);
  parts.push(`used ${c.used_count}${c.usage_limit != null ? ` of ${c.usage_limit}` : ""}`);
  if (c.per_customer_limit != null) parts.push(`${c.per_customer_limit} per customer`);
  if (c.starts_at) parts.push(`from ${instantToDay(c.starts_at)}`);
  if (c.ends_at) parts.push(`until ${instantToDay(c.ends_at)}`);
  return parts.join(" · ");
}

function expired(c: Coupon): boolean {
  return (!!c.ends_at && new Date(c.ends_at) < new Date()) || (c.usage_limit != null && c.used_count >= c.usage_limit);
}

/** Discount codes buyers type at checkout. Code and type are fixed once made; amounts, limits and dates can change. */
export function CouponManager({ token }: { token: string }) {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("percent");
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);

  const load = useCallback(() => couponsApi.list(token, query.trim() || undefined).then(setCoupons), [token, query]);
  const { busy, error, ok, run, fail } = useAdminAction(load);

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)));
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const upper = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,50}$/.test(upper)) return fail("The code needs 2–50 letters, numbers, - or _ (no spaces).");
    const body = fromDraft(draft, type);
    if (typeof body === "string") return fail(body);
    if (await run(() => couponsApi.create(token, { code: upper, coupon_type: type, ...body }), `${upper} is ready to use.`)) {
      setCode(""); setDraft(EMPTY);
    }
  }

  async function save(c: Coupon) {
    const body = fromDraft(editDraft, c.coupon_type);
    if (typeof body === "string") return fail(body);
    if (await run(() => couponsApi.update(token, c.id, body), `${c.code} saved.`)) setEditing(null);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void add(e)} aria-labelledby="add-coupon-heading" className="space-y-4 rounded-xl border p-4" noValidate>
        <h2 id="add-coupon-heading" className="font-semibold">New coupon</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Code" required hint="What buyers type, e.g. EID25.">
            {(p) => <Input {...p} value={code} maxLength={50} className="uppercase" onChange={(e) => setCode(e.target.value)} />}
          </FormField>
          <FormField label="Type">
            {(p) => (
              <Select {...p} value={type} onChange={(e) => setType(e.target.value as CouponType)}>
                <option value="percent">Percent off</option>
                <option value="fixed">Rupees off</option>
                <option value="free_shipping">Free delivery</option>
              </Select>
            )}
          </FormField>
        </div>
        <DraftFields draft={draft} type={type} onChange={setDraft} />
        <Button type="submit" className="gap-1" disabled={busy}>
          <Plus aria-hidden className="h-4 w-4" /> Create coupon
        </Button>
      </form>

      <ActionNotices error={error ?? loadError} ok={ok} />

      <div className="max-w-sm">
        <FormField label="Find a code">
          {(p) => <Input {...p} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />}
        </FormField>
      </div>

      {!coupons && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}
      {coupons?.length === 0 && <p className="text-sm text-muted-foreground">No coupons{query ? " match" : " yet"}.</p>}
      {coupons && coupons.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {coupons.map((c) => (
            <li key={c.id} className="space-y-3 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-medium">{c.code}</p>
                  <p className="text-sm text-muted-foreground">{rules(c)}</p>
                </div>
                {!c.is_active ? <Badge variant="neutral">Off</Badge> : expired(c) ? <Badge variant="warning">Used up or ended</Badge> : <Badge variant="success">Live</Badge>}
                <Button size="sm" variant="ghost" className="gap-1" disabled={busy} aria-label={`Edit ${c.code}`}
                  onClick={() => { setEditing(c.id); setEditDraft(toDraft(c)); }}>
                  <Pencil aria-hidden className="h-3 w-3" /> Edit
                </Button>
                <Button size="sm" variant="outline" disabled={busy} aria-label={`${c.is_active ? "Switch off" : "Switch on"} ${c.code}`}
                  onClick={() => void run(() => couponsApi.setActive(token, c.id, !c.is_active),
                    c.is_active ? `${c.code} switched off.` : `${c.code} switched on.`)}>
                  {c.is_active ? "Switch off" : "Switch on"}
                </Button>
              </div>
              {editing === c.id && (
                <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                  <DraftFields draft={editDraft} type={c.coupon_type} onChange={setEditDraft} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void save(c)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

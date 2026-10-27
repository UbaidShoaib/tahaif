"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import type { AdminProduct } from "@/components/admin/ProductList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch, ApiError } from "@/lib/api";
import {
  buildersAdminApi,
  ROLE_OPTIONS,
  swapOrder,
  wholeNumber,
  type AdminBuilderConfig,
  type BuilderKind,
  type ComponentRole,
} from "@/lib/builders-admin";
import { formatPrice } from "@/lib/utils";

type Notice = { kind: "error" | "ok"; text: string } | null;

/**
 * Turn the product into a build-your-own hamper or bouquet and choose what buyers
 * can put in it. Items come from the same shop, so each bucket is one delivery.
 * The product's main price is the price of the empty basket or wrap.
 */
export function BuilderEditor({
  token,
  productId,
  productSlug,
  vendorId,
  basePrice,
}: {
  token: string;
  productId: string;
  productSlug: string;
  vendorId: string;
  basePrice: number;
}) {
  const [config, setConfig] = useState<AdminBuilderConfig | null>(null);
  const [shopProducts, setShopProducts] = useState<AdminProduct[]>([]);
  const [kind, setKind] = useState<BuilderKind | "">("");
  const [minItems, setMinItems] = useState("1");
  const [maxItems, setMaxItems] = useState("");
  const [pick, setPick] = useState("");
  const [pickRole, setPickRole] = useState<ComponentRole>("item");
  const [pickMax, setPickMax] = useState("10");
  const [rows, setRows] = useState<Record<string, { role: ComponentRole; max: string }>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const fill = (c: AdminBuilderConfig) => {
    setConfig(c);
    setKind(c.builder_kind ?? "");
    setMinItems(String(c.min_items));
    setMaxItems(c.max_items === null ? "" : String(c.max_items));
    setRows(Object.fromEntries(c.components.map((x) => [x.id, { role: x.role, max: String(x.max_qty) }])));
  };

  useEffect(() => {
    void (async () => {
      try {
        const [c, products] = await Promise.all([
          buildersAdminApi.get(token, productId),
          apiFetch<AdminProduct[]>(`/admin/products?vendor_id=${vendorId}`, { token }),
        ]);
        fill(c);
        setShopProducts(products);
      } catch (e) {
        setNotice({ kind: "error", text: e instanceof ApiError ? e.detail : "Could not load the builder." });
      }
    })();
  }, [token, productId, vendorId]);

  async function run(work: () => Promise<AdminBuilderConfig>, done: string) {
    setBusy(true);
    setNotice(null);
    try {
      fill(await work());
      setNotice({ kind: "ok", text: done });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof ApiError ? e.detail : "Could not save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const sorted = useMemo(
    () => [...(config?.components ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [config],
  );
  const inBuilder = new Set(sorted.map((c) => c.component_product_id));
  const choices = shopProducts.filter((p) => p.id !== productId && !inBuilder.has(p.id));

  function saveSettings() {
    const min = wholeNumber(minItems, 1, 100);
    const max = maxItems.trim() ? wholeNumber(maxItems, 1, 200) : null;
    if (kind && min === null) return setNotice({ kind: "error", text: "The least items must be a whole number from 1 to 100." });
    if (kind && maxItems.trim() && max === null) return setNotice({ kind: "error", text: "The most items must be a whole number from 1 to 200, or blank for no limit." });
    void run(
      () => buildersAdminApi.saveSettings(token, productId, { builder_kind: kind || null, min_items: min ?? 1, max_items: max }),
      kind ? "Builder settings saved." : "This is an ordinary product again.",
    );
  }

  function addItem() {
    const max = wholeNumber(pickMax, 1, 100);
    if (!pick) return setNotice({ kind: "error", text: "Choose a product to add." });
    if (max === null) return setNotice({ kind: "error", text: "Most per bucket must be a whole number from 1 to 100." });
    const name = shopProducts.find((p) => p.id === pick)?.name ?? "Item";
    void run(
      () => buildersAdminApi.addComponent(token, productId, { component_product_id: pick, role: pickRole, max_qty: max }),
      `${name} added.`,
    ).then(() => setPick(""));
  }

  function saveItem(id: string, name: string) {
    const row = rows[id];
    const max = wholeNumber(row.max, 1, 100);
    if (max === null) return setNotice({ kind: "error", text: `${name}: most per bucket must be a whole number from 1 to 100.` });
    void run(() => buildersAdminApi.updateComponent(token, productId, id, { role: row.role, max_qty: max }), `${name} saved.`);
  }

  function move(id: string, direction: -1 | 1) {
    const changes = swapOrder(sorted, id, direction);
    if (changes.length === 0) return;
    void run(async () => {
      let latest: AdminBuilderConfig | null = null;
      for (const c of changes) latest = await buildersAdminApi.updateComponent(token, productId, c.id, { sort_order: c.sort_order });
      return latest as AdminBuilderConfig;
    }, "Order saved.");
  }

  const isBuilder = !!config?.builder_kind;
  const show = notice && (
    notice.kind === "error" ? (
      <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{notice.text}</div>
    ) : (
      <p role="status" className="text-sm text-success-foreground">{notice.text}</p>
    )
  );

  return (
    <section aria-labelledby="builder-heading" className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="builder-heading" className="font-semibold">Build-your-own</h2>
          <p className="text-sm text-muted-foreground">
            Let buyers fill this product with items from the same shop. The main price above
            ({formatPrice(basePrice)}) is the empty basket or wrap; each item adds its own price.
          </p>
        </div>
        {isBuilder && (
          <Link href={`/build/${productSlug}`} target="_blank" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
            Try it <ExternalLink aria-hidden className="h-3 w-3" />
          </Link>
        )}
      </div>

      {!config ? (
        show || <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Type">
              {(p) => (
                <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as BuilderKind | "")}>
                  <option value="">Not a builder (ordinary product)</option>
                  <option value="hamper">Hamper / gift box</option>
                  <option value="bouquet">Bouquet</option>
                </Select>
              )}
            </FormField>
            <FormField label="Least items">
              {(p) => <Input {...p} inputMode="numeric" disabled={!kind} value={minItems} onChange={(e) => setMinItems(e.target.value)} />}
            </FormField>
            <FormField label="Most items" hint="Blank = no limit">
              {(p) => <Input {...p} inputMode="numeric" disabled={!kind} placeholder="No limit" value={maxItems} onChange={(e) => setMaxItems(e.target.value)} />}
            </FormField>
          </div>
          <Button variant="outline" disabled={busy} onClick={saveSettings}>Save builder settings</Button>

          {isBuilder && (
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">Items buyers can add</h3>
              {sorted.length === 0 && (
                <p className="text-sm text-muted-foreground">No items yet — buyers can&apos;t start this builder until you add some.</p>
              )}
              <ul className="space-y-2">
                {sorted.map((c, i) => {
                  const row = rows[c.id];
                  if (!row) return null;
                  return (
                    <li key={c.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 font-medium">{c.name}</span>
                        <span className="text-sm text-muted-foreground">{formatPrice(c.price_pkr)}</span>
                        {!c.is_active && <Badge variant="neutral">Off</Badge>}
                        {!c.product_is_active && <Badge variant="neutral">Only in builders</Badge>}
                      </div>
                      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto_auto]">
                        <FormField label="Role">
                          {(p) => (
                            <Select {...p} value={row.role} onChange={(e) => setRows((r) => ({ ...r, [c.id]: { ...row, role: e.target.value as ComponentRole } }))}>
                              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </Select>
                          )}
                        </FormField>
                        <FormField label="Most per bucket">
                          {(p) => <Input {...p} inputMode="numeric" value={row.max} onChange={(e) => setRows((r) => ({ ...r, [c.id]: { ...row, max: e.target.value } }))} />}
                        </FormField>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => saveItem(c.id, c.name)}>Save</Button>
                        <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => void run(() => buildersAdminApi.updateComponent(token, productId, c.id, { is_active: !c.is_active }),
                            c.is_active ? `${c.name} switched off.` : `${c.name} switched on.`)}>
                          {c.is_active ? "Switch off" : "Switch on"}
                        </Button>
                        <span className="flex">
                          <Button size="sm" variant="ghost" aria-label={`Move ${c.name} up`} disabled={busy || i === 0} onClick={() => move(c.id, -1)}>
                            <ChevronUp aria-hidden className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={`Move ${c.name} down`} disabled={busy || i === sorted.length - 1} onClick={() => move(c.id, 1)}>
                            <ChevronDown aria-hidden className="h-4 w-4" />
                          </Button>
                        </span>
                        {confirmRemove === c.id ? (
                          <span className="flex gap-1">
                            <Button size="sm" variant="destructive" disabled={busy}
                              onClick={() => void run(() => buildersAdminApi.removeComponent(token, productId, c.id), `${c.name} removed.`).then(() => setConfirmRemove(null))}>
                              Remove
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>Keep</Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="ghost" aria-label={`Remove ${c.name}`} disabled={busy} onClick={() => setConfirmRemove(c.id)}>
                            <Trash2 aria-hidden className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <p className="text-sm font-medium">Add an item</p>
                {choices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Every product from this shop is already in. Add more products for the shop first (Add product), then come back.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                    <FormField label="Product" className="col-span-2 sm:col-span-1">
                      {(p) => (
                        <Select {...p} value={pick} onChange={(e) => setPick(e.target.value)}>
                          <option value="">Choose…</option>
                          {choices.map((x) => (
                            <option key={x.id} value={x.id}>{x.name} — {formatPrice(x.base_price_pkr)}{x.is_active ? "" : " (hidden from shop)"}</option>
                          ))}
                        </Select>
                      )}
                    </FormField>
                    <FormField label="Role">
                      {(p) => (
                        <Select {...p} value={pickRole} onChange={(e) => setPickRole(e.target.value as ComponentRole)}>
                          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      )}
                    </FormField>
                    <FormField label="Most per bucket">
                      {(p) => <Input {...p} inputMode="numeric" value={pickMax} onChange={(e) => setPickMax(e.target.value)} />}
                    </FormField>
                    <Button size="sm" className="gap-1" disabled={busy} onClick={addItem}>
                      <Plus aria-hidden className="h-3 w-3" /> Add
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Something sold only inside builders (a single stem, a ribbon) can be a hidden product: it stays out
                  of the shop and search but buyers can still add it here. Use “Switch off” to stop offering an item.
                </p>
              </div>
            </div>
          )}
          {show}
        </>
      )}
    </section>
  );
}

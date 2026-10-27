"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { slugify } from "@/components/admin/AddProductForm";
import { ActionNotices, errorText, useAdminAction } from "@/components/admin/use-admin-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { shopsApi, type AdminShop } from "@/lib/back-office-admin";

type City = { id: string; name: string };
type Draft = { name: string; phone: string; cityId: string; description: string; logo: string };

const toDraft = (s: AdminShop): Draft => ({
  name: s.name, phone: s.contact_phone ?? "", cityId: s.city_id, description: s.description ?? "", logo: s.logo_url ?? "",
});

/**
 * Approved shops, the house shop included. Closing a shop takes every one of its products
 * off sale (they keep their own published/hidden state for when it reopens). New partner
 * shops come through Shop applications; staff can open a house shop here.
 */
export function ShopManager({ token }: { token: string }) {
  const [shops, setShops] = useState<AdminShop[] | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [cityId, setCityId] = useState("");

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);

  const load = useCallback(() => shopsApi.list(token, query.trim() || undefined).then(setShops), [token, query]);
  const { busy, error, ok, run, fail } = useAdminAction(load);

  useEffect(() => {
    load().catch((e: unknown) => setLoadError(errorText(e)));
  }, [load]);

  useEffect(() => {
    apiFetch<City[]>("/cities", { token })
      .then((c) => { setCities(c); setCityId((id) => id || c[0]?.id || ""); })
      .catch((e: unknown) => setLoadError(errorText(e)));
  }, [token]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return fail("Enter the shop's name.");
    if (!/^[a-z0-9-]+$/.test(slug)) return fail("The URL name may only use a–z, 0–9 and hyphens.");
    if (!cityId) return fail("Choose the shop's city.");
    const added = await run(
      () => shopsApi.create(token, { name: name.trim(), slug, city_id: cityId, description: null }),
      `${name.trim()} is open. Add its products from Add product.`,
    );
    if (added) { setName(""); setSlug(""); setSlugEdited(false); }
  }

  async function save(s: AdminShop) {
    if (!draft) return;
    if (!draft.name.trim()) return fail("Enter the shop's name.");
    if (draft.logo.trim() && !/^https?:\/\//.test(draft.logo.trim())) return fail("The logo must be a web link starting with https://.");
    const saved = await run(() => shopsApi.update(token, s.id, {
      name: draft.name.trim(), contact_phone: draft.phone.trim() || null, city_id: draft.cityId,
      description: draft.description.trim() || null, logo_url: draft.logo.trim() || null,
    }), `${draft.name.trim()} saved.`);
    if (saved) setEditing(null);
  }

  const setOpen = (s: AdminShop, open: boolean) => {
    setConfirmClose(null);
    void run(() => shopsApi.update(token, s.id, { is_active: open }),
      open ? `${s.name} is open again.` : `${s.name} is closed; its products are off sale.`);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void add(e)} aria-labelledby="add-shop-heading" className="space-y-4 rounded-xl border p-4" noValidate>
        <div>
          <h2 id="add-shop-heading" className="font-semibold">Open a house shop</h2>
          <p className="text-sm text-muted-foreground">A shop run by staff, with no owner account. Partner shops apply through /sell.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Shop name" required>
            {(p) => (
              <Input {...p} value={name} maxLength={255}
                onChange={(e) => { setName(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)); }} />
            )}
          </FormField>
          <FormField label="URL name" required hint={`Shown as /vendor/${slug || "…"}`}>
            {(p) => <Input {...p} value={slug} maxLength={255} onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} />}
          </FormField>
          <FormField label="City" required>
            {(p) => (
              <Select {...p} value={cityId} onChange={(e) => setCityId(e.target.value)}>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </FormField>
        </div>
        <Button type="submit" className="gap-1" disabled={busy}>
          <Plus aria-hidden className="h-4 w-4" /> Open shop
        </Button>
      </form>

      <ActionNotices error={error ?? loadError} ok={ok} />

      <div className="max-w-sm">
        <FormField label="Find a shop">
          {(p) => <Input {...p} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />}
        </FormField>
      </div>

      {!shops && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}
      {shops?.length === 0 && <p className="text-sm text-muted-foreground">No shops{query ? " match" : " yet"}.</p>}
      {shops && shops.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {shops.map((s) => (
            <li key={s.id} className="space-y-3 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {s.city_name} · {s.live_product_count} of {s.product_count} products live
                    {s.is_house ? " · house shop" : s.owner_email ? ` · ${s.owner_email}` : ""}
                    {s.contact_phone && ` · ${s.contact_phone}`}
                  </p>
                  {!s.is_house && (
                    <p className="text-xs text-muted-foreground">
                      Paid to: {s.bank_iban ? `${s.bank_account_title ?? ""}, ${s.bank_name ?? ""}, ${s.bank_iban}` : "no bank details yet"}
                    </p>
                  )}
                </div>
                {!s.is_active && <Badge variant="warning">Closed</Badge>}
                {s.is_active && (
                  <a href={`/vendor/${s.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
                    View <ExternalLink aria-hidden className="h-3 w-3" />
                  </a>
                )}
                <Button size="sm" variant="ghost" className="gap-1" disabled={busy} aria-label={`Edit ${s.name}`}
                  onClick={() => { setEditing(s.id); setDraft(toDraft(s)); setConfirmClose(null); }}>
                  <Pencil aria-hidden className="h-3 w-3" /> Edit
                </Button>
                {!s.is_active ? (
                  <Button size="sm" variant="outline" disabled={busy} aria-label={`Reopen ${s.name}`} onClick={() => setOpen(s, true)}>Reopen</Button>
                ) : confirmClose === s.id ? (
                  <Button size="sm" variant="destructive" disabled={busy} aria-label={`Confirm closing ${s.name}`} onClick={() => setOpen(s, false)}>
                    Close and take {s.live_product_count} products off sale
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} aria-label={`Close ${s.name}`} onClick={() => setConfirmClose(s.id)}>Close</Button>
                )}
              </div>
              {editing === s.id && draft && (
                <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField label="Shop name">
                      {(p) => <Input {...p} value={draft.name} maxLength={255} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
                    </FormField>
                    <FormField label="Contact phone" hint="Where staff reach the shop about orders.">
                      {(p) => <Input {...p} type="tel" value={draft.phone} maxLength={30} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />}
                    </FormField>
                    <FormField label="City">
                      {(p) => (
                        <Select {...p} value={draft.cityId} onChange={(e) => setDraft({ ...draft, cityId: e.target.value })}>
                          {!cities.some((c) => c.id === draft.cityId) && <option value={draft.cityId}>{s.city_name}</option>}
                          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                      )}
                    </FormField>
                  </div>
                  <FormField label="Logo link">
                    {(p) => <Input {...p} type="url" value={draft.logo} onChange={(e) => setDraft({ ...draft, logo: e.target.value })} />}
                  </FormField>
                  <FormField label="About the shop" hint="Shown on its page.">
                    {(p) => <Textarea {...p} rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />}
                  </FormField>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void save(s)}>Save</Button>
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

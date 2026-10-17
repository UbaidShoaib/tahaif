"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Eye, EyeOff, Star, Trash2, Upload } from "lucide-react";
import { toPaisa } from "@/components/admin/AddProductForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";

type Option = { id: string; name: string };

type ProductImage = { id: string; url: string; alt_text: string | null; sort_order: number; is_primary: boolean };

type ProductCity = {
  city_id: string;
  price_override_pkr: number | null;
  delivery_fee_pkr: number;
  lead_time_hours: number;
  same_day_cutoff: string | null;
  is_available: boolean;
};

export type EditableProduct = {
  id: string;
  vendor_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  base_price_pkr: number;
  is_active: boolean;
  images: ProductImage[];
  product_cities: ProductCity[];
  vendor: { id: string; name: string; slug: string } | null;
};

/** One editable row per city, in rupees as typed. */
type CityRow = { delivers: boolean; price: string; fee: string; lead: string; cutoff: string };

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const rupees = (paisa: number) => String(Math.round(paisa / 100));

function cityRows(cities: Option[], product: EditableProduct): Record<string, CityRow> {
  const rows: Record<string, CityRow> = {};
  for (const c of cities) {
    const pc = product.product_cities.find((x) => x.city_id === c.id);
    rows[c.id] = {
      delivers: pc?.is_available ?? false,
      price: pc?.price_override_pkr != null ? rupees(pc.price_override_pkr) : "",
      fee: pc ? rupees(pc.delivery_fee_pkr) : "0",
      lead: pc ? String(pc.lead_time_hours) : "24",
      cutoff: pc?.same_day_cutoff?.slice(0, 5) ?? "",
    };
  }
  return rows;
}

function Notice({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return kind === "error" ? (
    <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{children}</div>
  ) : (
    <p role="status" className="text-sm text-success-foreground">{children}</p>
  );
}

/**
 * Edit any product, live or hidden: details and price, photos, and which cities
 * it delivers to at what fee. Each section saves on its own so a slow photo
 * upload never holds back a price fix.
 */
export function ProductEditor({ token, productId }: { token: string; productId: string }) {
  const [product, setProduct] = useState<EditableProduct | null>(null);
  const [categories, setCategories] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [rows, setRows] = useState<Record<string, CityRow>>({});

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ section: string; kind: "error" | "ok"; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  // Remounts the file input after an upload; a file input can't be cleared through state.
  const [photoInputKey, setPhotoInputKey] = useState(0);

  const fill = useCallback((p: EditableProduct, allCities: Option[]) => {
    setProduct(p);
    setName(p.name);
    setDescription(p.description ?? "");
    setPrice(rupees(p.base_price_pkr));
    setCategoryId(p.category_id ?? "");
    setRows(cityRows(allCities, p));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [p, cat, ci] = await Promise.all([
          apiFetch<EditableProduct>(`/admin/products/${productId}`, { token }),
          apiFetch<Option[]>("/categories", { token }),
          apiFetch<Option[]>("/cities", { token }),
        ]);
        setCategories(cat);
        setCities(ci);
        fill(p, ci);
      } catch (e) {
        setLoadError(e instanceof ApiError ? e.detail : "Could not load the product.");
      }
    })();
  }, [token, productId, fill]);

  async function run(section: string, work: () => Promise<unknown>, done: string) {
    setBusy(section);
    setNotice(null);
    try {
      await work();
      // Always reload: the server is the source of truth for photo order and city rows.
      fill(await apiFetch<EditableProduct>(`/admin/products/${productId}`, { token }), cities);
      setNotice({ section, kind: "ok", text: done });
    } catch (e) {
      setNotice({ section, kind: "error", text: e instanceof ApiError ? e.detail : "Could not save. Try again." });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Notice kind="error">{loadError}</Notice>
        <BackLink />
      </div>
    );
  }
  if (!product) return <p className="text-sm text-muted-foreground">Loading product…</p>;

  const slug = product.slug;
  const show = (section: string) =>
    notice?.section === section ? <Notice kind={notice.kind}>{notice.text}</Notice> : null;

  function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    const basePrice = toPaisa(price);
    if (!name.trim()) return setNotice({ section: "details", kind: "error", text: "Enter a product name." });
    if (basePrice === null) return setNotice({ section: "details", kind: "error", text: "Enter the price in whole rupees." });
    void run("details", () => apiFetch(`/products/${slug}`, {
      method: "PATCH",
      token,
      body: {
        name: name.trim(),
        description: description.trim() || null,
        base_price_pkr: basePrice,
        category_id: categoryId || null,
      },
    }), "Details saved.");
  }

  function setVisibility(isActive: boolean) {
    void run("visibility", () => apiFetch(`/admin/products/${product!.id}/active`, {
      method: "PATCH", token, body: { is_active: isActive },
    }), isActive ? "Published — buyers can see it now." : "Hidden from the store.");
  }

  function uploadPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      return setNotice({ section: "photos", kind: "error", text: "The photo is larger than 10 MB." });
    }
    const form = new FormData();
    form.append("file", file);
    void run("photos", () => apiFetch(`/products/${slug}/images/upload`, { method: "POST", token, body: form }), "Photo added.")
      .then(() => setPhotoInputKey((k) => k + 1));
  }

  function removePhoto(id: string) {
    setConfirmRemove(null);
    void run("photos", () => apiFetch(`/products/${slug}/images/${id}`, { method: "DELETE", token }), "Photo removed.");
  }

  function setRow(cityId: string, patch: Partial<CityRow>) {
    setRows((r) => ({ ...r, [cityId]: { ...r[cityId], ...patch } }));
  }

  function saveCities(e: React.FormEvent) {
    e.preventDefault();
    const known = new Set(product!.product_cities.map((pc) => pc.city_id));
    const entries: (ProductCity & { city_id: string })[] = [];
    for (const c of cities) {
      const row = rows[c.id];
      // A city never set up and still unticked needs no row; one that was set up is switched off, not deleted.
      if (!row.delivers && !known.has(c.id)) continue;
      const override = row.price.trim() ? toPaisa(row.price) : null;
      const fee = toPaisa(row.fee);
      const lead = Number(row.lead);
      if (row.price.trim() && override === null) {
        return setNotice({ section: "cities", kind: "error", text: `${c.name}: enter the price in whole rupees, or leave it blank.` });
      }
      if (fee === null) return setNotice({ section: "cities", kind: "error", text: `${c.name}: enter the delivery fee in whole rupees.` });
      if (!Number.isInteger(lead) || lead < 0) {
        return setNotice({ section: "cities", kind: "error", text: `${c.name}: lead time must be a whole number of hours.` });
      }
      entries.push({
        city_id: c.id,
        is_available: row.delivers,
        price_override_pkr: override,
        delivery_fee_pkr: fee,
        lead_time_hours: lead,
        same_day_cutoff: row.cutoff || null,
      });
    }
    void run("cities", () => apiFetch(`/products/${slug}/cities`, { method: "PUT", token, body: entries }), "Delivery cities saved.");
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <BackLink />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{product.name}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={product.is_active ? "success" : "warning"}>{product.is_active ? "Live" : "Hidden"}</Badge>
              {product.vendor?.name}
              <span aria-hidden>·</span>
              <span className="font-mono">/p/{slug}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {product.is_active && (
              <Button size="sm" variant="outline" className="gap-1" asChild>
                <Link href={`/p/${slug}`} target="_blank" rel="noopener">
                  <ExternalLink aria-hidden className="h-3 w-3" /> View in store
                </Link>
              </Button>
            )}
            {product.is_active ? (
              <Button size="sm" variant="outline" className="gap-1" disabled={busy !== null} onClick={() => setVisibility(false)}>
                <EyeOff aria-hidden className="h-3 w-3" /> Hide
              </Button>
            ) : (
              <Button size="sm" className="gap-1" disabled={busy !== null} onClick={() => setVisibility(true)}>
                <Eye aria-hidden className="h-3 w-3" /> Publish
              </Button>
            )}
          </div>
        </div>
        {show("visibility")}
      </div>

      <form onSubmit={saveDetails} aria-labelledby="details-heading" className="space-y-4 rounded-xl border p-4">
        <h2 id="details-heading" className="font-semibold">Details</h2>
        <FormField label="Product name" required>
          {(p) => <Input {...p} value={name} maxLength={255} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label="Description">
          {(p) => <Textarea {...p} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Price (Rs)" required hint="Cities can charge a different price below.">
            {(p) => <Input {...p} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />}
          </FormField>
          <FormField label="Category">
            {(p) => (
              <Select {...p} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">None</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </FormField>
        </div>
        {show("details")}
        <Button type="submit" disabled={busy !== null}>{busy === "details" ? "Saving…" : "Save details"}</Button>
      </form>

      <section aria-labelledby="photos-heading" className="space-y-4 rounded-xl border p-4">
        <h2 id="photos-heading" className="font-semibold">Photos</h2>
        {product.images.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos yet. Products with a photo sell far better.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {product.images.map((img) => (
              <li key={img.id} className="space-y-2">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- photos from any storage host */}
                  <img src={img.url} alt={img.alt_text ?? product.name} className="aspect-square w-full rounded-lg object-cover" />
                  {img.is_primary && <Badge variant="brand" className="absolute left-2 top-2">Main photo</Badge>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {!img.is_primary && (
                    <Button size="sm" variant="outline" className="gap-1" disabled={busy !== null}
                      onClick={() => void run("photos", () => apiFetch(`/products/${slug}/images/${img.id}/primary`, { method: "POST", token }), "Main photo changed.")}>
                      <Star aria-hidden className="h-3 w-3" /> Make main
                    </Button>
                  )}
                  {confirmRemove === img.id ? (
                    <>
                      <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => removePhoto(img.id)}>
                        Confirm remove
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>Keep</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" className="gap-1" disabled={busy !== null}
                      aria-label={`Remove photo ${img.sort_order + 1}`} onClick={() => setConfirmRemove(img.id)}>
                      <Trash2 aria-hidden className="h-3 w-3" /> Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <FormField label="Add a photo" hint="JPEG, PNG or WebP, up to 10 MB.">
          {(p) => (
            <div className="flex items-center gap-2">
              <Upload aria-hidden className="h-4 w-4 text-muted-foreground" />
              <Input {...p} key={photoInputKey} type="file" accept="image/jpeg,image/png,image/webp"
                disabled={busy !== null} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
            </div>
          )}
        </FormField>
        {show("photos")}
      </section>

      <form onSubmit={saveCities} aria-labelledby="cities-heading" className="space-y-4 rounded-xl border p-4">
        <div>
          <h2 id="cities-heading" className="font-semibold">Delivery cities</h2>
          <p className="text-sm text-muted-foreground">
            Leave the city price blank to charge the main price. Untick a city to stop taking orders there.
          </p>
        </div>
        <div className="space-y-3">
          {cities.map((c) => {
            const row = rows[c.id];
            if (!row) return null;
            return (
              <fieldset key={c.id} className="rounded-lg border p-3">
                <legend className="px-1">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={row.delivers} onChange={(e) => setRow(c.id, { delivers: e.target.checked })} />
                    {c.name}
                  </label>
                </legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <FormField label="City price (Rs)">
                    {(p) => <Input {...p} inputMode="numeric" placeholder={price} disabled={!row.delivers}
                      value={row.price} onChange={(e) => setRow(c.id, { price: e.target.value })} />}
                  </FormField>
                  <FormField label="Delivery fee (Rs)">
                    {(p) => <Input {...p} inputMode="numeric" disabled={!row.delivers}
                      value={row.fee} onChange={(e) => setRow(c.id, { fee: e.target.value })} />}
                  </FormField>
                  <FormField label="Lead time (hours)">
                    {(p) => <Input {...p} inputMode="numeric" disabled={!row.delivers}
                      value={row.lead} onChange={(e) => setRow(c.id, { lead: e.target.value })} />}
                  </FormField>
                  <FormField label="Same-day cutoff">
                    {(p) => <Input {...p} type="time" disabled={!row.delivers}
                      value={row.cutoff} onChange={(e) => setRow(c.id, { cutoff: e.target.value })} />}
                  </FormField>
                </div>
              </fieldset>
            );
          })}
        </div>
        {show("cities")}
        <Button type="submit" disabled={busy !== null}>{busy === "cities" ? "Saving…" : "Save delivery cities"}</Button>
      </form>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin?section=products" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
      <ArrowLeft aria-hidden className="h-4 w-4" /> All products
    </Link>
  );
}

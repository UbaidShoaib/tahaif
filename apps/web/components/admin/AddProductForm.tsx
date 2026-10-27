"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { buildersAdminApi, wholeNumber, type BuilderKind } from "@/lib/builders-admin";
import { categoryOptions } from "@/lib/taxonomy-admin";

type Option = { id: string; name: string };
type Vendor = Option & { owner_user_id: string | null };
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type CreatedProduct = { id: string; slug: string; name: string };
type Kind = "regular" | BuilderKind;

export function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Rupees as typed → paisa as stored. Returns null for anything that isn't a whole, non-negative amount. */
export function toPaisa(rupees: string): number | null {
  if (!/^\d+$/.test(rupees.trim())) return null;
  return Number(rupees.trim()) * 100;
}

/**
 * Staff create a product that goes live at once (no approval step, unlike vendor listings).
 * Every product needs a vendor; the house shop (a vendor with no owner account) is preselected.
 * Picking a build-your-own type makes it a hamper or bouquet base (ADR 0014); its items are
 * added next, in the product editor.
 */
export function AddProductForm({ token }: { token: string }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("regular");
  const [minItems, setMinItems] = useState("1");
  const [maxItems, setMaxItems] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  // Remounts the file input on reset; a file input can't be cleared through state.
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [cityIds, setCityIds] = useState<string[]>([]);
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [leadTime, setLeadTime] = useState("24");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<(CreatedProduct & { kind: Kind }) | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [v, c, ci] = await Promise.all([
          apiFetch<Vendor[]>("/vendors", { token }),
          apiFetch<Parameters<typeof categoryOptions>[0]>("/categories", { token }),
          apiFetch<Option[]>("/cities", { token }),
        ]);
        setVendors(v);
        setCategories(categoryOptions(c));
        setCities(ci);
        const house = v.find((x) => x.owner_user_id === null) ?? v[0];
        if (house) setVendorId(house.id);
      } catch (e) {
        setLoadError(e instanceof ApiError ? e.detail : "Could not load vendors, categories and cities.");
      }
    })();
  }, [token]);

  function onNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function toggleCity(id: string) {
    setCityIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function reset() {
    setName(""); setSlug(""); setSlugEdited(false); setDescription("");
    setPrice(""); setPhoto(null); setPhotoInputKey((k) => k + 1); setCityIds([]); setCategoryId("");
    setKind("regular"); setMinItems("1"); setMaxItems("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);

    const basePrice = toPaisa(price);
    const fee = toPaisa(deliveryFee);
    const lead = Number(leadTime);
    if (!vendorId) return setError("Choose a vendor.");
    if (!name.trim()) return setError("Enter a product name.");
    if (!/^[a-z0-9-]+$/.test(slug)) return setError("The URL name may only use a–z, 0–9 and hyphens.");
    if (basePrice === null) return setError("Enter the price in whole rupees.");
    if (fee === null) return setError("Enter the delivery fee in whole rupees.");
    if (!Number.isInteger(lead) || lead < 0) return setError("Lead time must be a whole number of hours.");
    if (photo && photo.size > MAX_PHOTO_BYTES) return setError("The photo is larger than 10 MB.");
    const least = wholeNumber(minItems, 1, 100);
    const most = maxItems.trim() ? wholeNumber(maxItems, 1, 200) : null;
    if (kind !== "regular") {
      if (least === null) return setError("The fewest items must be a whole number from 1 to 100.");
      if (maxItems.trim() && most === null) return setError("The most items must be a whole number from 1 to 200, or blank.");
      if (most !== null && most < least) return setError("The most items can't be fewer than the fewest.");
    }

    setSubmitting(true);
    let product: CreatedProduct | null = null;
    try {
      product = await apiFetch<CreatedProduct>("/products", {
        method: "POST",
        token,
        body: {
          vendor_id: vendorId,
          category_id: categoryId || null,
          name: name.trim(),
          slug,
          description: description.trim() || null,
          base_price_pkr: basePrice,
        },
      });
      if (photo) {
        const form = new FormData();
        form.append("file", photo);
        form.append("alt_text", name.trim());
        form.append("is_primary", "true");
        await apiFetch(`/products/${product.slug}/images/upload`, { method: "POST", token, body: form });
      }
      if (cityIds.length) {
        await apiFetch(`/products/${product.slug}/cities`, {
          method: "PUT",
          token,
          body: cityIds.map((city_id) => ({ city_id, delivery_fee_pkr: fee, lead_time_hours: lead })),
        });
      }
      if (kind !== "regular") {
        await buildersAdminApi.saveSettings(token, product.id, { builder_kind: kind, min_items: least ?? 1, max_items: most });
      }
      setCreated({ ...product, kind });
      reset();
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : "Something went wrong.";
      // The product row exists even if the image or cities step failed; say so rather than invite a duplicate.
      setError(product ? `Product created, but finishing it failed: ${detail}` : `Could not create the product: ${detail}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div>;
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-2xl space-y-4" noValidate>
      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      {created && created.kind === "regular" && (
        <div role="status" className="rounded-lg bg-success-soft p-3 text-sm">
          “{created.name}” is live.{" "}
          <a href={`/p/${created.slug}`} target="_blank" rel="noreferrer" className="text-link hover:underline">
            View it →
          </a>{" "}
          <a href={`/admin/products/${created.id}`} className="text-link hover:underline">
            Add sizes, occasions and more photos →
          </a>
        </div>
      )}
      {created && created.kind !== "regular" && (
        <div role="status" className="rounded-lg bg-success-soft p-3 text-sm">
          “{created.name}” is set up as a build-your-own {created.kind}. Buyers can start it once it has items.{" "}
          <a href={`/admin/products/${created.id}#builder-heading`} className="text-link hover:underline">
            Add the items buyers can pick →
          </a>
        </div>
      )}

      <fieldset className="space-y-3 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">What are you adding?</legend>
        <FormField label="Product type"
          hint={kind === "regular"
            ? "A ready-made gift buyers order as it is."
            : "An empty basket or wrap buyers fill themselves. Price it at what the container costs; each item adds its own price."}>
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="regular">Ready-made product</option>
              <option value="hamper">Build-your-own hamper</option>
              <option value="bouquet">Build-your-own bouquet</option>
            </Select>
          )}
        </FormField>
        {kind !== "regular" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Fewest items" hint="A bucket needs at least this many before it can go in the cart.">
              {(p) => <Input {...p} inputMode="numeric" value={minItems} onChange={(e) => setMinItems(e.target.value)} />}
            </FormField>
            <FormField label="Most items" hint="Leave blank for no limit.">
              {(p) => <Input {...p} inputMode="numeric" value={maxItems} onChange={(e) => setMaxItems(e.target.value)} />}
            </FormField>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Vendor" required
          hint={kind === "regular" ? "Your own shop is picked by default." : "Items in the builder must come from this same shop."}>
          {(p) => (
            <Select {...p} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.owner_user_id === null ? " (house)" : ""}
                </option>
              ))}
            </Select>
          )}
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

      <FormField label="Product name" required>
        {(p) => <Input {...p} value={name} maxLength={255} onChange={(e) => onNameChange(e.target.value)} />}
      </FormField>
      <FormField label="URL name" required hint={`Shown as /p/${slug || "…"}`}>
        {(p) => (
          <Input {...p} value={slug} maxLength={255}
            onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} />
        )}
      </FormField>
      <FormField label="Description">
        {(p) => <Textarea {...p} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Price (Rs)" required>
          {(p) => <Input {...p} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />}
        </FormField>
        <FormField label="Photo" hint="JPEG, PNG or WebP, up to 10 MB. Becomes the main photo.">
          {(p) => (
            <Input {...p} key={photoInputKey} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          )}
        </FormField>
      </div>

      <fieldset className="space-y-3 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">Delivers to</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {cities.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cityIds.includes(c.id)} onChange={() => toggleCity(c.id)} />
              {c.name}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Delivery fee (Rs)">
            {(p) => <Input {...p} inputMode="numeric" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />}
          </FormField>
          <FormField label="Lead time (hours)">
            {(p) => <Input {...p} inputMode="numeric" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />}
          </FormField>
        </div>
        {cityIds.length === 0 && (
          <p className="text-xs text-muted-foreground">Pick at least one city, or buyers won’t be able to order it.</p>
        )}
      </fieldset>

      <Button type="submit" className="gap-1" disabled={submitting}>
        <Plus aria-hidden className="h-4 w-4" /> {submitting ? "Adding…" : "Add product"}
      </Button>
    </form>
  );
}

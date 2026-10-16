"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";

type Option = { id: string; name: string };
type Vendor = Option & { owner_user_id: string | null };
type CreatedProduct = { id: string; slug: string; name: string };

export function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Rupees as typed → paisa as stored. Returns null for anything that isn't a whole, non-negative amount. */
function toPaisa(rupees: string): number | null {
  if (!/^\d+$/.test(rupees.trim())) return null;
  return Number(rupees.trim()) * 100;
}

/**
 * Staff create a product that goes live at once (no approval step, unlike vendor listings).
 * Every product needs a vendor; the house shop (a vendor with no owner account) is preselected.
 */
export function AddProductForm({ token }: { token: string }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [cityIds, setCityIds] = useState<string[]>([]);
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [leadTime, setLeadTime] = useState("24");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedProduct | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [v, c, ci] = await Promise.all([
          apiFetch<Vendor[]>("/vendors", { token }),
          apiFetch<Option[]>("/categories", { token }),
          apiFetch<Option[]>("/cities", { token }),
        ]);
        setVendors(v);
        setCategories(c);
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
    setPrice(""); setImageUrl(""); setCityIds([]); setCategoryId("");
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
      if (imageUrl.trim()) {
        const q = new URLSearchParams({ url: imageUrl.trim(), alt_text: name.trim(), is_primary: "true" });
        await apiFetch(`/products/${product.slug}/images?${q.toString()}`, { method: "POST", token });
      }
      if (cityIds.length) {
        await apiFetch(`/products/${product.slug}/cities`, {
          method: "PUT",
          token,
          body: cityIds.map((city_id) => ({ city_id, delivery_fee_pkr: fee, lead_time_hours: lead })),
        });
      }
      setCreated(product);
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
      {created && (
        <div role="status" className="rounded-lg bg-success-soft p-3 text-sm">
          “{created.name}” is live.{" "}
          <a href={`/p/${created.slug}`} target="_blank" rel="noreferrer" className="text-link hover:underline">
            View it →
          </a>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Vendor" required hint="Your own shop is picked by default.">
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
        <FormField label="Image URL" hint="Optional; becomes the main photo.">
          {(p) => <Input {...p} type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />}
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

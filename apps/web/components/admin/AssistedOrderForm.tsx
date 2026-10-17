"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppMessages } from "@/components/admin/WhatsAppMessages";
import { ApiError } from "@/lib/api";
import { catalogApi, type City, type Product } from "@/lib/catalog";
import {
  SOURCE_LABELS,
  socialOrdersApi,
  type AssistedOrderCreate,
  type AssistedOrderRead,
  type OrderSource,
} from "@/lib/social-orders";
import { DELIVERY_SLOTS, type DeliverySlot } from "@/lib/delivery";
import { formatPrice } from "@/lib/utils";

type Line = { product_id: string; variant_id: string; qty: number; greeting_message: string };

const EMPTY_LINE: Line = { product_id: "", variant_id: "", qty: 1, greeting_message: "" };

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * "New DM order": staff enter an order a customer placed in an Instagram DM or
 * WhatsApp chat (ADR 0009, SOP §2). It goes through normal checkout, so prices,
 * cutoffs and city rules are the website's. Then the order summary goes out on WhatsApp.
 */
export function AssistedOrderForm({ token }: { token: string }) {
  const [cities, setCities] = useState<City[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [source, setSource] = useState<OrderSource>("instagram");
  const [sourceRef, setSourceRef] = useState("");
  const [campaign, setCampaign] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [cityId, setCityId] = useState("");
  const [date, setDate] = useState(tomorrow);
  const [slot, setSlot] = useState<DeliverySlot | "">("");
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [giftFrom, setGiftFrom] = useState("");
  const [surprise, setSurprise] = useState(false);
  const [payment, setPayment] = useState<"cod" | "bank_transfer">("bank_transfer");
  const [coupon, setCoupon] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [placed, setPlaced] = useState<AssistedOrderRead | null>(null);
  // One key per filled-in order, so a double click never creates two orders.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    catalogApi.getCities().then(setCities).catch(() => setError("Could not load cities."));
  }, []);

  useEffect(() => {
    if (!cityId) { setProducts([]); return; }
    catalogApi
      .getProducts({ city_id: cityId, page_size: 100 })
      .then((page) => setProducts(page.items))
      .catch(() => setError("Could not load products for this city."));
  }, [cityId]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent, allowDuplicate = false) {
    e.preventDefault();
    setError(null);
    if (surprise && payment === "cod") {
      setError("Cash on delivery isn't possible for a surprise gift; use bank transfer.");
      return;
    }
    const items = lines.filter((l) => l.product_id);
    if (items.length === 0) { setError("Add at least one product."); return; }
    const body: AssistedOrderCreate = {
      source,
      source_ref: sourceRef.trim() || null,
      campaign: campaign.trim() || null,
      buyer_phone: buyerPhone.trim(),
      buyer_email: buyerEmail.trim() || null,
      items: items.map((l) => ({
        product_id: l.product_id,
        variant_id: l.variant_id || null,
        qty: l.qty,
        greeting_message: l.greeting_message.trim() || null,
      })),
      payment_method: payment,
      delivery_city_id: cityId,
      delivery_date: date,
      delivery_slot: slot || null,
      recipient_name: recipientName.trim(),
      recipient_phone: recipientPhone.trim(),
      address_line1: address.trim(),
      landmark: landmark.trim() || null,
      gift_from: giftFrom.trim() || null,
      surprise,
      coupon_code: coupon.trim() || null,
      notes: notes.trim() || null,
      allow_duplicate: allowDuplicate,
    };
    setBusy(true);
    try {
      setPlaced(await socialOrdersApi.create(body, token, allowDuplicate ? `${idempotencyKey}-dup` : idempotencyKey));
      setDuplicate(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDuplicate(true);
        setError(err.detail);
      } else {
        setError(err instanceof ApiError ? err.detail : "Could not place the order.");
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPlaced(null);
    setLines([{ ...EMPTY_LINE }]);
    setBuyerPhone(""); setBuyerEmail(""); setSourceRef(""); setCampaign("");
    setRecipientName(""); setRecipientPhone(""); setAddress(""); setLandmark("");
    setSlot(""); setGiftFrom(""); setSurprise(false); setCoupon(""); setNotes("");
    setIdempotencyKey(crypto.randomUUID());
  }

  if (placed) {
    const ref = placed.order.public_token.slice(0, 8).toUpperCase();
    return (
      <div className="space-y-4 rounded-xl border p-5">
        <h2 className="text-h3">Order #{ref} placed — {formatPrice(placed.order.total_pkr)}</h2>
        <p className="text-sm text-muted-foreground">
          Next: send the order summary. WhatsApp opens with the message filled in; press send.
          The customer confirms on the link{payment === "bank_transfer" ? " and uploads their receipt there" : ""}.
        </p>
        <WhatsAppMessages orderId={placed.order.id} token={token} initial={placed.messages} />
        <Button variant="outline" onClick={reset}>Take another order</Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-6" noValidate>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-semibold">Where it came from</legend>
        <FormField label="Source" required>
          {(p) => (
            <Select {...p} value={source} onChange={(e) => setSource(e.target.value as OrderSource)}>
              {(["instagram", "whatsapp", "phone", "walk_in"] as const).map((s) => (
                <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="IG handle / chat ref">
          {(p) => <Input {...p} value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="@sara.uk" />}
        </FormField>
        <FormField label="Reel / campaign">
          {(p) => <Input {...p} value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="eid-cakes-reel" />}
        </FormField>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Buyer</legend>
        <FormField label="WhatsApp number" required hint="Any format: 0300 1234567, +44 7700 900123">
          {(p) => <Input {...p} type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />}
        </FormField>
        <FormField label="Email (optional)">
          {(p) => <Input {...p} type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />}
        </FormField>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Delivery and products</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="City" required>
            {(p) => (
              <Select {...p} value={cityId} onChange={(e) => { setCityId(e.target.value); setLines([{ ...EMPTY_LINE }]); }}>
                <option value="">Choose a city…</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </FormField>
          <FormField label="Delivery date" required>
            {(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </FormField>
          <FormField label="Delivery time">
            {(p) => (
              <Select {...p} value={slot} onChange={(e) => setSlot(e.target.value as DeliverySlot | "")}>
                <option value="">Any time</option>
                {DELIVERY_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            )}
          </FormField>
        </div>
        {lines.map((line, i) => {
          const product = byId.get(line.product_id);
          const variants = product?.variants.filter((v) => v.is_active) ?? [];
          return (
            <div key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_6rem_auto]">
              <FormField label={`Product ${i + 1}`} required>
                {(p) => (
                  <Select
                    {...p}
                    disabled={!cityId}
                    value={line.product_id}
                    onChange={(e) => updateLine(i, { product_id: e.target.value, variant_id: "" })}
                  >
                    <option value="">{cityId ? "Choose a product…" : "Choose a city first"}</option>
                    {products.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.name} — {formatPrice(pr.base_price_pkr)}</option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField label="Option">
                {(p) => (
                  <Select {...p} disabled={variants.length === 0} value={line.variant_id} onChange={(e) => updateLine(i, { variant_id: e.target.value })}>
                    <option value="">{variants.length ? "Standard" : "—"}</option>
                    {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </Select>
                )}
              </FormField>
              <FormField label="Qty">
                {(p) => (
                  <Input {...p} type="number" min={1} max={20} value={line.qty}
                    onChange={(e) => updateLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                )}
              </FormField>
              <div className="flex items-end">
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove product ${i + 1}`}
                  disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <FormField label="Greeting card message" className="sm:col-span-4">
                {(p) => <Textarea {...p} dir="auto" value={line.greeting_message} onChange={(e) => updateLine(i, { greeting_message: e.target.value })} />}
              </FormField>
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}>
          <Plus className="h-4 w-4" /> Add product
        </Button>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Recipient</legend>
        <FormField label="Name" required>
          {(p) => <Input {...p} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />}
        </FormField>
        <FormField label="Phone" required>
          {(p) => <Input {...p} type="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />}
        </FormField>
        <FormField label="Address" required className="sm:col-span-2">
          {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} />}
        </FormField>
        <FormField label="Landmark">
          {(p) => <Input {...p} value={landmark} onChange={(e) => setLandmark(e.target.value)} />}
        </FormField>
        <FormField label="From (name on messages)">
          {(p) => <Input {...p} value={giftFrom} onChange={(e) => setGiftFrom(e.target.value)} placeholder="Sara (London)" />}
        </FormField>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-4 w-4" checked={surprise} onChange={(e) => setSurprise(e.target.checked)} />
          Surprise — don&apos;t contact the recipient before delivery
        </label>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Payment</legend>
        <FormField label="Method" required>
          {(p) => (
            <Select {...p} value={payment} onChange={(e) => setPayment(e.target.value as "cod" | "bank_transfer")}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cod">Cash on delivery</option>
            </Select>
          )}
        </FormField>
        <FormField label="Coupon">
          {(p) => <Input {...p} value={coupon} onChange={(e) => setCoupon(e.target.value)} />}
        </FormField>
        <FormField label="Notes for the shop" className="sm:col-span-2">
          {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </FormField>
      </fieldset>

      {error && (
        <div role="alert" className="space-y-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <p>{error}</p>
          {duplicate && (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={(e) => void submit(e, true)}>
              Customer confirmed — place it anyway
            </Button>
          )}
        </div>
      )}
      <Button type="submit" disabled={busy}>{busy ? "Placing…" : "Place order"}</Button>
    </form>
  );
}

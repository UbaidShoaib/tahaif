"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, ExternalLink, Eye, Phone, XCircle } from "lucide-react";
import { STATUS_BADGE, orderCode, statusOptions } from "@/components/admin/OrderList";
import { WhatsAppMessages } from "@/components/admin/WhatsAppMessages";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { SOURCE_LABELS } from "@/lib/social-orders";
import { formatPrice } from "@/lib/utils";

type Fulfillment = {
  id: string;
  vendor_name: string;
  vendor_phone: string | null;
  status: string;
  delivery_date: string;
  delivery_slot: string | null;
  recipient_name: string;
  recipient_phone: string;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  city_name: string;
  courier_tracking: string | null;
  delivery_photo_url: string | null;
  received_by: string | null;
};

type Item = {
  id: string;
  product_name: string;
  product_image_url: string | null;
  variant_name: string | null;
  qty: number;
  unit_price_pkr: number;
  line_total_pkr: number;
  greeting_message: string | null;
  has_note: boolean;
  customization: Record<string, unknown> | null;
};

type Payment = {
  method: string;
  status: string;
  amount_pkr: number;
  amount_charged: number;
  currency: string;
  proof_url: string | null;
  provider_ref: string | null;
  verified_at: string | null;
};

type StaffNote = { id: string; body: string; author_name: string | null; created_at: string };

export type AdminOrder = {
  id: string;
  public_token: string;
  status: string;
  next_statuses: string[];
  currency: string;
  total_charged: number;
  subtotal_pkr: number;
  delivery_pkr: number;
  discount_pkr: number;
  total_pkr: number;
  placed_at: string;
  surprise: boolean;
  source: string;
  customer_confirmed_at: string | null;
  items: Item[];
  fulfillments: Fulfillment[];
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_note: string | null;
  coupon_code: string | null;
  source_ref: string | null;
  campaign: string | null;
  taken_by: string | null;
  payment: Payment | null;
  staff_notes: StaffNote[];
  timeline: { at: string; label: string; by?: string | null }[];
};

const when = (iso: string) => new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short" });
const words = (s: string) => s.replace(/_/g, " ");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-xl border p-4">
      <h2 id={id} className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** A phone number staff can tap to call. */
function Tel({ number }: { number: string }) {
  return (
    <a href={`tel:${number.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-link hover:underline">
      <Phone aria-hidden className="h-3 w-3" /> {number}
    </a>
  );
}

/**
 * One order on one page: who it's from and for, where each gift goes and which
 * shop makes it, payment and receipt, internal notes and what has happened so far.
 */
export function OrderDetail({ token, orderId }: { token: string; orderId: string }) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [showMessages, setShowMessages] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await apiFetch<AdminOrder>(`/admin/orders/${orderId}`, { token }));
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.detail : "Could not load the order.");
    }
  }, [token, orderId]);

  useEffect(() => { void load(); }, [load]);

  async function act(path: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(path, { method, token, body });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Could not update the order.");
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return setNoteError("Write something first.");
    setBusy(true);
    setNoteError(null);
    try {
      await apiFetch(`/admin/orders/${orderId}/notes`, { method: "POST", token, body: { body: note.trim() } });
      setNote("");
      await load();
    } catch (e) {
      setNoteError(e instanceof ApiError ? e.detail : "Could not save the note.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div>
        <BackLink />
      </div>
    );
  }
  if (!order) return <p className="text-sm text-muted-foreground">Loading order…</p>;

  const code = orderCode(order.public_token);
  const p = order.payment;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <BackLink />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-mono text-2xl font-bold">#{code}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status] ?? "bg-muted"}`}>
                {words(order.status)}
              </span>
              {formatPrice(order.total_pkr)}
              <span aria-hidden>·</span>
              placed {when(order.placed_at)}
              {order.surprise && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">surprise</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Order status"
              className="rounded border px-2 py-1 text-sm"
              value={order.status}
              disabled={busy || order.next_statuses.length === 0}
              onChange={(e) => void act(`/admin/orders/${order.id}/status`, "PATCH", { status: e.target.value })}
            >
              {statusOptions(order).map((s) => <option key={s} value={s}>{words(s)}</option>)}
            </select>
            {order.buyer_phone && (
              <Button size="sm" variant="outline" aria-expanded={showMessages} onClick={() => setShowMessages((v) => !v)}>
                WhatsApp
              </Button>
            )}
            <Button size="sm" variant="ghost" className="gap-1" asChild>
              <a href={`/track/${order.public_token}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden className="h-3 w-3" /> Buyer&apos;s view
              </a>
            </Button>
          </div>
        </div>
        {error && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {showMessages && <WhatsAppMessages orderId={order.id} token={token} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {order.fulfillments.map((f, i) => (
            <Section key={f.id} title={order.fulfillments.length > 1 ? `Recipient ${i + 1}` : "Recipient"}>
              <div className="flex flex-wrap justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">{f.recipient_name}</p>
                  <Tel number={f.recipient_phone} />
                  <address className="not-italic text-muted-foreground">
                    {f.address_line1}
                    {f.address_line2 && <><br />{f.address_line2}</>}
                    <br />{f.city_name}
                  </address>
                  {f.landmark && <p className="text-muted-foreground">Landmark: {f.landmark}</p>}
                </div>
                <dl className="min-w-48 space-y-1">
                  <Row label="Deliver">{day(f.delivery_date)}{f.delivery_slot ? `, ${f.delivery_slot}` : ""}</Row>
                  <Row label="Shop">{f.vendor_name}</Row>
                  {f.vendor_phone && <Row label="Shop phone"><Tel number={f.vendor_phone} /></Row>}
                  <Row label="Delivery">{words(f.status)}</Row>
                  {f.courier_tracking && <Row label="Tracking">{f.courier_tracking}</Row>}
                  {f.received_by && <Row label="Received by">{f.received_by}</Row>}
                </dl>
              </div>
              {f.delivery_photo_url && (
                <a href={f.delivery_photo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
                  <Eye aria-hidden className="h-3 w-3" /> Delivery photo
                </a>
              )}
            </Section>
          ))}

          <Section title="Items">
            <ul className="divide-y">
              {order.items.map((it) => (
                <li key={it.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  {it.product_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photos from any storage host
                    <img src={it.product_image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div aria-hidden className="h-14 w-14 shrink-0 rounded-lg bg-muted" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1 text-sm">
                    <p className="font-medium">
                      {it.qty} × {it.product_name}{it.variant_name ? ` (${it.variant_name})` : ""}
                    </p>
                    {it.greeting_message && <p className="italic text-muted-foreground">“{it.greeting_message}”</p>}
                    {it.has_note && <p className="text-xs text-muted-foreground">Voice/video note on the card</p>}
                    {it.customization && Object.entries(it.customization).map(([k, v]) => (
                      <p key={k} className="text-xs text-muted-foreground">{words(k)}: {String(v)}</p>
                    ))}
                  </div>
                  <p className="text-sm font-medium">{formatPrice(it.line_total_pkr)}</p>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t pt-3">
              <Row label="Subtotal">{formatPrice(order.subtotal_pkr)}</Row>
              <Row label="Delivery">{formatPrice(order.delivery_pkr)}</Row>
              {order.discount_pkr > 0 && (
                <Row label={order.coupon_code ? `Discount (${order.coupon_code})` : "Discount"}>−{formatPrice(order.discount_pkr)}</Row>
              )}
              <Row label="Total"><span className="font-semibold">{formatPrice(order.total_pkr)}</span></Row>
              {order.currency !== "PKR" && (
                <Row label="Charged">{formatPrice(order.total_charged, order.currency)}</Row>
              )}
            </dl>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Buyer">
            <dl className="space-y-1">
              {order.buyer_name && <Row label="Name">{order.buyer_name}</Row>}
              {order.buyer_phone && <Row label="Phone"><Tel number={order.buyer_phone} /></Row>}
              {order.buyer_email && <Row label="Email"><a href={`mailto:${order.buyer_email}`} className="text-link hover:underline">{order.buyer_email}</a></Row>}
              <Row label="Came from">
                {SOURCE_LABELS[order.source] ?? order.source}{order.source_ref ? ` · ${order.source_ref}` : ""}
              </Row>
              {order.campaign && <Row label="Campaign">{order.campaign}</Row>}
              {order.taken_by && <Row label="Taken by">{order.taken_by}</Row>}
              {order.source !== "web" && (
                <Row label="Confirmed">{order.customer_confirmed_at ? when(order.customer_confirmed_at) : "Not yet"}</Row>
              )}
            </dl>
            {order.buyer_note && (
              <p className="rounded-lg bg-muted p-3 text-sm"><span className="font-medium">Buyer&apos;s note:</span> {order.buyer_note}</p>
            )}
          </Section>

          <Section title="Payment">
            {p ? (
              <>
                <dl className="space-y-1">
                  <Row label="Method">{words(p.method)}</Row>
                  <Row label="Status">{words(p.status)}</Row>
                  <Row label="Amount">{formatPrice(p.amount_charged, p.currency)}</Row>
                  {p.provider_ref && <Row label="Reference">{p.provider_ref}</Row>}
                  {p.verified_at && <Row label="Checked">{when(p.verified_at)}</Row>}
                </dl>
                <div className="flex flex-wrap gap-2">
                  {p.proof_url && (
                    <Button size="sm" variant="outline" className="gap-1" asChild>
                      <a href={p.proof_url} target="_blank" rel="noopener noreferrer"><Eye className="h-3 w-3" /> View receipt</a>
                    </Button>
                  )}
                  {p.status === "awaiting_verification" && (
                    <>
                      <Button size="sm" className="gap-1 bg-success text-white hover:bg-success/90 dark:text-background" disabled={busy}
                        onClick={() => void act(`/admin/orders/${order.id}/verify-payment`, "POST", { verified: true })}>
                        <CheckCircle className="h-3 w-3" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="gap-1" disabled={busy}
                        onClick={() => void act(`/admin/orders/${order.id}/verify-payment`, "POST", { verified: false })}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No payment recorded.</p>
            )}
          </Section>

          <Section title="Staff notes">
            <p className="text-xs text-muted-foreground">Only staff see these. Notes can’t be edited — add a new one to correct.</p>
            {order.staff_notes.length > 0 && (
              <ul className="space-y-2">
                {order.staff_notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-muted p-3 text-sm">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{n.author_name ?? "Former staff"} · {when(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={(e) => void addNote(e)} className="space-y-2">
              <FormField label="Add a note" error={noteError ?? undefined}>
                {(fp) => <Textarea {...fp} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />}
              </FormField>
              <Button type="submit" size="sm" disabled={busy}>Save note</Button>
            </form>
          </Section>

          <Section title="Timeline">
            <ol className="space-y-2 border-l pl-4">
              {order.timeline.map((ev, i) => (
                <li key={`${ev.at}-${i}`} className="text-sm">
                  <p>{ev.label}</p>
                  <p className="text-xs text-muted-foreground">{when(ev.at)}{ev.by ? ` · ${ev.by}` : ""}</p>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
      <ArrowLeft aria-hidden className="h-4 w-4" /> All orders
    </Link>
  );
}

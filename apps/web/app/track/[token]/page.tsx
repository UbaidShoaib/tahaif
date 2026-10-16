import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Gift } from "lucide-react";
import { isOptimizable } from "@/lib/image-hosts";
import { cartApi } from "@/lib/cart";
import { formatPrice } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { ShareTracking } from "@/components/orders/ShareTracking";
import { isOrderLive, orderNumber, statusHeadline } from "@/lib/orders";
import { LiveOrderRefresh } from "@/components/orders/LiveOrderRefresh";
import { formatCalendarDate } from "@/lib/datetime";
import { DualTime } from "@/components/time/DualTime";
import { SupportWhatsApp } from "@/components/support/SupportWhatsApp";
import { CardNoteControl } from "@/components/greeting/CardNoteControl";
import { ThanksReceived } from "@/components/thanks/ThanksReceived";
import { ConfirmOrderPanel } from "@/components/orders/ConfirmOrderPanel";
import { BankTransferPanel } from "@/components/orders/BankTransferPanel";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return {
    title: `Track order ${orderNumber(token)}`,
  };
}

const longDate = (iso: string) => formatCalendarDate(iso, { weekday: "long", day: "numeric", month: "long" });

/**
 * Design: one emphasised container (the status hero) and one framed object (the
 * greeting card, styled as the real card). Everything else is open, grouped by
 * spacing, serif headings and hairline dividers — no stack of bordered boxes.
 */
export default async function TrackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let order;
  try {
    order = await cartApi.getOrder(token);
  } catch {
    notFound();
  }

  const number = orderNumber(String(order.public_token));
  const first = order.fulfillments[0];
  const recipients = new Set(order.fulfillments.map((f) => f.recipient_name));
  const recipient = recipients.size === 1 && first ? first.recipient_name : null;
  const vendor = order.fulfillments.length === 1 && first ? first.vendor_name : null;
  const delivered = order.fulfillments.filter((f) => f.delivered_at);
  const heroPhoto = delivered.find((f) => f.delivery_photo_url);
  const isDone = order.status === "delivered" || order.status === "completed";
  const cards = order.items.filter((i) => i.greeting_message || i.can_edit_note || i.has_note);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <LiveOrderRefresh active={isOrderLive(order.status)} />

      {/* Hero: the one answer the buyer came for */}
      <section aria-labelledby="status-heading" className="overflow-hidden rounded-2xl bg-primary-soft">
        {heroPhoto?.delivery_photo_url && (
          <figure>
            {/* Signed, short-lived S3 link: not a configured next/image host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroPhoto.delivery_photo_url}
              alt={`Your gift delivered to ${heroPhoto.recipient_name}`}
              className="aspect-[4/3] w-full object-cover sm:aspect-[16/9]"
            />
            <figcaption className="sr-only">Photo taken at delivery</figcaption>
          </figure>
        )}
        <div className="space-y-3 p-6 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wider text-primary-soft-foreground">
            Order <span className="font-mono">{number}</span>
          </p>
          <h1 id="status-heading" className="text-h1 text-foreground">
            {statusHeadline(order.status, recipient, vendor)}
          </h1>
          {first && !isDone && isOrderLive(order.status) && (
            <p className="text-lg text-foreground-secondary">
              Arriving <strong className="font-semibold text-foreground">{longDate(first.delivery_date)}</strong>
              {first.delivery_slot && <>, {first.delivery_slot}</>}
              {first.city_name && <> in {first.city_name}</>}
            </p>
          )}
          {isDone && delivered[0]?.delivered_at && (
            <p className="text-lg text-foreground-secondary">
              <DualTime iso={delivered[0].delivered_at} cityTz={delivered[0].city_timezone} />
              {delivered[0].received_by && <> · received by {delivered[0].received_by}</>}
            </p>
          )}
          {isOrderLive(order.status) && (
            <p className="text-xs text-muted-foreground">This page updates on its own.</p>
          )}
        </div>
      </section>

      {/* Orders our team took from a chat: the buyer confirms them here (ADR 0009) */}
      {order.needs_confirmation && first && (
        <div className="mt-8">
          <ConfirmOrderPanel
            publicToken={String(order.public_token)}
            recipient={{ name: first.recipient_name, phone: first.recipient_phone, address: first.address_line1 }}
          />
        </div>
      )}
      {order.source && order.source !== "web" && !order.needs_confirmation &&
        order.payment_method === "bank_transfer" && order.status === "pending_payment" && (
        <div className="mt-8">
          <BankTransferPanel orderId={String(order.id)} publicToken={String(order.public_token)} totalPkr={order.total_pkr} />
        </div>
      )}

      {/* Thank-you notes are the emotional close of the journey: right under the hero */}
      {order.fulfillments.some((f) => f.thanks) && (
        <section aria-label="Thank-you notes" className="mt-8 space-y-4">
          {order.fulfillments.map(
            (f) => f.thanks && <ThanksReceived key={f.id} thanks={f.thanks} from={f.recipient_name} />,
          )}
        </section>
      )}

      {/* Progress */}
      <section aria-labelledby="progress-heading" className="mt-10">
        <h2 id="progress-heading" className="mb-5 text-h3 font-display">
          Progress
        </h2>
        <OrderTimeline status={order.status} />
      </section>

      {/* Delivery details, one open block per vendor */}
      <section aria-labelledby="delivery-heading" className="mt-10">
        <h2 id="delivery-heading" className="text-h3 font-display">
          Delivery
        </h2>
        <div className="divide-y">
          {order.fulfillments.map((f) => (
            <div key={f.id} className="py-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <p className="font-semibold">{f.vendor_name}</p>
                <OrderStatusBadge status={f.status} kind="fulfillment" />
              </div>
              <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">For</dt>
                <dd>{f.recipient_name}</dd>
                <dt className="text-muted-foreground">Address</dt>
                <dd>
                  {f.address_line1}, {f.city_name}
                </dd>
                <dt className="text-muted-foreground">Date</dt>
                <dd>
                  {longDate(f.delivery_date)}
                  {f.delivery_slot && <>, {f.delivery_slot}</>}
                </dd>
                {f.courier_tracking && (
                  <>
                    <dt className="text-muted-foreground">Courier ref</dt>
                    <dd className="font-mono">{f.courier_tracking}</dd>
                  </>
                )}
                {f.dispatched_at && (
                  <>
                    <dt className="text-muted-foreground">Dispatched</dt>
                    <dd>
                      <DualTime iso={f.dispatched_at} cityTz={f.city_timezone} />
                    </dd>
                  </>
                )}
                {f.delivered_at && (
                  <>
                    <dt className="text-muted-foreground">Delivered</dt>
                    <dd className="font-medium text-success-foreground">
                      <DualTime iso={f.delivered_at} cityTz={f.city_timezone} />
                      {f.received_by && <> · received by {f.received_by}</>}
                    </dd>
                  </>
                )}
              </dl>
              {/* The hero already shows one delivery photo; show the rest here */}
              {f.delivery_photo_url && f.id !== heroPhoto?.id && (
                <figure className="mt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.delivery_photo_url}
                    alt={`Your gift delivered to ${f.recipient_name}`}
                    className="max-h-80 w-full rounded-xl object-cover"
                  />
                  <figcaption className="mt-1 text-xs text-muted-foreground">Photo taken at delivery</figcaption>
                </figure>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Greeting cards: the one framed object, styled like the printed card */}
      {cards.length > 0 && (
        <section aria-labelledby="cards-heading" className="mt-10">
          <h2 id="cards-heading" className="mb-5 text-h3 font-display">
            {cards.length === 1 ? "Your card" : "Your cards"}
          </h2>
          <div className="space-y-5">
            {cards.map((item) => (
              <article
                key={item.id}
                className="relative rounded-xl bg-gold-soft px-6 dark:bg-card dark:ring-1 dark:ring-gold/30 pb-6 pt-7 shadow-sm before:absolute before:inset-x-6 before:top-3 before:h-px before:bg-gold"
              >
                <p className="text-xs font-medium uppercase tracking-wider text-gold-ink">With {item.product_name}</p>
                {item.greeting_message ? (
                  <p dir="auto" className="mt-3 font-display text-xl leading-relaxed text-foreground">
                    “{item.greeting_message}”
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No written message on this card.</p>
                )}
                {order.gift_from && <p className="mt-3 text-sm text-foreground-secondary">— {order.gift_from}</p>}
                <div className="mt-4">
                  <CardNoteControl publicToken={String(order.public_token)} item={item} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Summary: open rows and hairlines, prices in ink */}
      <section aria-labelledby="summary-heading" className="mt-10">
        <h2 id="summary-heading" className="mb-3 text-h3 font-display">
          Summary
        </h2>
        <ul className="divide-y text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 py-3">
              <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                {item.product_image_url ? (
                  <Image
                    src={item.product_image_url}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                    unoptimized={!isOptimizable(item.product_image_url)}
                  />
                ) : (
                  <Gift aria-hidden className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.product_name}</span>
                {(item.variant_name || item.qty > 1) && (
                  <span className="block text-muted-foreground">
                    {item.variant_name}
                    {item.variant_name && item.qty > 1 && " · "}
                    {item.qty > 1 && `Qty ${item.qty}`}
                  </span>
                )}
              </span>
              <span className="tabular-nums">{formatPrice(item.line_total_pkr)}</span>
            </li>
          ))}
        </ul>
        {/* Without these rows the lines don't add up to the total */}
        <div className="space-y-1 border-t py-3 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Delivery</span>
            <span className="tabular-nums">{order.delivery_pkr > 0 ? formatPrice(order.delivery_pkr) : "Free"}</span>
          </div>
          {order.discount_pkr > 0 && (
            <div className="flex justify-between text-success-foreground">
              <span>Discount</span>
              <span className="tabular-nums">−{formatPrice(order.discount_pkr)}</span>
            </div>
          )}
        </div>
        <div className="flex justify-between border-t-2 border-foreground/80 pt-3 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(order.total_pkr)}</span>
        </div>
        {order.currency !== "PKR" && (
          <div className="mt-1 flex justify-between text-sm text-muted-foreground">
            <span>Charged in {order.currency}</span>
            <span className="tabular-nums">{formatMoney(order.total_charged, order.currency)}</span>
          </div>
        )}
      </section>

      {/* Help & sharing, together at the end */}
      <section aria-labelledby="help-heading" className="mt-12 space-y-5 border-t pt-8">
        <h2 id="help-heading" className="text-h3 font-display">
          Need anything?
        </h2>
        <SupportWhatsApp
          label="Questions about this order? WhatsApp us"
          message={`Hi, I have a question about order ${number}.`}
        />
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Let family follow along:</p>
          <ShareTracking publicToken={String(order.public_token)} />
        </div>
        <Link href="/search" className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline">
          Send another gift <span aria-hidden>&nbsp;→</span>
        </Link>
      </section>
    </div>
  );
}

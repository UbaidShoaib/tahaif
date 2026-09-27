import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Package,
  MapPin,
  Calendar,
  CheckCircle,
  Clock,
  Truck,
  RotateCcw,
} from "lucide-react";
import { cartApi } from "@/lib/cart";
import { formatPrice } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { ShareTracking } from "@/components/orders/ShareTracking";
import { orderNumber } from "@/lib/orders";
import { formatCalendarDate } from "@/lib/datetime";
import { DualTime } from "@/components/time/DualTime";
import { SupportWhatsApp } from "@/components/support/SupportWhatsApp";
import { CardNoteControl } from "@/components/greeting/CardNoteControl";
import { ThanksReceived } from "@/components/thanks/ThanksReceived";

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


  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-h1">Track your order</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Order number <strong className="font-mono text-foreground">{orderNumber(String(order.public_token))}</strong>
        </p>
        <div className="mt-3">
          <ShareTracking publicToken={String(order.public_token)} />
        </div>
        <div className="mt-4">
          <SupportWhatsApp
            label="Questions about this order? WhatsApp us"
            message={`Hi, I have a question about order ${orderNumber(String(order.public_token))}.`}
          />
        </div>
      </div>

      {/* Status timeline */}
      <section aria-labelledby="progress-heading" className="mb-6 rounded-xl border bg-card p-5">
        <h2 id="progress-heading" className="sr-only">
          Progress
        </h2>
        <OrderTimeline status={order.status} />
      </section>

      {/* Fulfillments */}
      {order.fulfillments.map((f) => (
        <div key={f.id} className="rounded-xl border p-5 mb-4 space-y-3">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Package className="h-4 w-4" />
              {f.vendor_name}
            </h2>
            <OrderStatusBadge status={f.status} kind="fulfillment" />
          </div>

          <div className="text-sm space-y-1.5 text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                Delivery date:{" "}
                {formatCalendarDate(f.delivery_date, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" />
              <span>
                {f.recipient_name} · {f.address_line1}, {f.city_name}
              </span>
            </div>
            {f.courier_tracking && (
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5" />
                <span>Tracking: {f.courier_tracking}</span>
              </div>
            )}
            {f.dispatched_at && (
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  Dispatched: <DualTime iso={f.dispatched_at} cityTz={f.city_timezone} />
                </span>
              </div>
            )}
            {f.delivered_at && (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>
                  Delivered: <DualTime iso={f.delivered_at} cityTz={f.city_timezone} />
                  {f.received_by && <> · Received by {f.received_by}</>}
                </span>
              </div>
            )}
            {f.thanks && (
              <div className="pt-2">
                <ThanksReceived thanks={f.thanks} from={f.recipient_name} />
              </div>
            )}
            {f.delivery_photo_url && (
              <figure className="pt-2">
                {/* Signed, short-lived S3 link: not a configured next/image host. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.delivery_photo_url}
                  alt={`Your gift delivered to ${f.recipient_name}`}
                  className="max-h-80 w-full rounded-lg border object-cover sm:w-auto"
                />
                <figcaption className="mt-1 text-xs text-muted-foreground">
                  Photo taken at delivery
                </figcaption>
              </figure>
            )}
          </div>
        </div>
      ))}

      {/* Greeting cards: message plus an optional voice/video note played from a QR code */}
      {order.items.some((i) => i.greeting_message || i.can_edit_note || i.has_note) && (
        <section aria-labelledby="cards-heading" className="mb-6 space-y-4 rounded-xl border p-5">
          <h2 id="cards-heading" className="font-semibold">
            Greeting cards
          </h2>
          {order.items
            .filter((i) => i.greeting_message || i.can_edit_note || i.has_note)
            .map((item) => (
              <div key={item.id} className="space-y-2">
                <p className="text-sm font-medium">{item.product_name}</p>
                {item.greeting_message && (
                  <p dir="auto" className="text-sm italic text-muted-foreground">
                    “{item.greeting_message}”
                  </p>
                )}
                <CardNoteControl publicToken={String(order.public_token)} item={item} />
              </div>
            ))}
        </section>
      )}

      {/* Order summary */}
      <div className="rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold">Order Summary</h2>
        <div className="space-y-2 text-sm">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span className="text-muted-foreground">
                {item.product_name}
                {item.variant_name ? ` (${item.variant_name})` : ""}
                {" ×"}{item.qty}
              </span>
              <span>{formatPrice(item.line_total_pkr)}</span>
            </div>
          ))}
        </div>
        <Separator />
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span className="text-link">{formatPrice(order.total_pkr)}</span>
        </div>
        {order.currency !== "PKR" && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Charged in {order.currency}</span>
            <span>{formatMoney(order.total_charged, order.currency)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={undefined}
          asChild
        >
          <Link href={`/track/${token}`}>
            <RotateCcw className="h-4 w-4" />
            Refresh Status
          </Link>
        </Button>
        <Button variant="outline" asChild className="flex-1">
          <Link href="/search">Browse More Gifts</Link>
        </Button>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle, Package, MapPin, Calendar, ArrowRight } from "lucide-react";
import { cartApi } from "@/lib/cart";
import { formatPrice } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BankTransferPanel } from "@/components/orders/BankTransferPanel";
import { GuestOrderNote } from "@/components/checkout/GuestOrderNote";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { ShareTracking } from "@/components/orders/ShareTracking";
import { orderNumber } from "@/lib/orders";
import { PAKISTAN_TZ, formatCalendarDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const PAYMENT_LABELS: Record<string, string> = {
  cod: "Cash on Delivery",
  bank_transfer: "Bank Transfer",
};

export default async function SuccessPage({
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

  const isBank = order.payment_method === "bank_transfer";
  // "Ammi's gift is booked for Monday 2 November." from the first delivery.
  const first = order.fulfillments[0];
  const forWhom = first?.recipient_name ? `${first.recipient_name}'s gift` : "Your gift";
  const headline = first
    ? `Thank you. ${forWhom} is booked for ${formatCalendarDate(first.delivery_date, { weekday: "long", day: "numeric", month: "long" })}.`
    : "Thank you. Your order is placed.";

  const placedDate = new Date(order.placed_at).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    // Server-rendered: pin the zone instead of using the server's (UTC).
    timeZone: PAKISTAN_TZ,
  });

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      {/* Layout decision (confirmation A, next-step card): thanks, then the one thing left to do. */}
      <header className="mb-6 space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-success">
          <CheckCircle aria-hidden className="h-4 w-4" />
          Order <span className="font-mono">{orderNumber(String(order.public_token))}</span> placed
        </p>
        <h1 className="text-h1">{headline}</h1>
        <span aria-hidden className="block h-px w-12 bg-gold" />
      </header>

      {isBank ? (
        <BankTransferPanel
          orderId={String(order.id)}
          publicToken={String(order.public_token)}
          totalPkr={order.total_pkr}
          title="One step left: send your transfer"
        />
      ) : (
        <section aria-labelledby="pay-heading" className="mb-6 space-y-2 rounded-xl border border-success/30 bg-success-soft p-5">
          <h2 id="pay-heading" className="text-h3">
            Nothing more to do
          </h2>
          <p className="text-sm text-foreground-secondary">
            Cash is paid to the rider on delivery. Share the tracking link so family can follow along.
          </p>
          <ShareTracking publicToken={String(order.public_token)} />
        </section>
      )}

      {/* What happens next */}
      <section aria-labelledby="next-heading" className="mb-6 rounded-xl border bg-card p-5">
        <h2 id="next-heading" className="mb-3 text-h3">
          What happens next
        </h2>
        <ol className="list-decimal space-y-1.5 ps-5 text-sm text-foreground-secondary">
          {isBank && <li>We check your receipt, usually within a few hours.</li>}
          <li>The shop prepares your gift for the delivery date.</li>
          <li>A rider delivers it and calls the recipient on arrival.</li>
          {!isBank && <li>The recipient pays the rider in cash, unless you&apos;ve already paid.</li>}
        </ol>
        {isBank && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
            <span className="text-sm font-medium">Share the tracking link:</span>
            <ShareTracking publicToken={String(order.public_token)} />
          </div>
        )}
      </section>

      {/* Order details */}
      <div className="rounded-xl border p-5 space-y-5">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Placed on</p>
            <p className="font-medium">{placedDate}</p>
          </div>
          <div className="text-end">
            <p className="text-sm text-muted-foreground">Status</p>
            <OrderStatusBadge status={order.status} />
          </div>
          <div className="text-end">
            <p className="text-sm text-muted-foreground">Payment</p>
            <p className="font-medium">
              {PAYMENT_LABELS[order.payment_method ?? ""] ?? order.payment_method}
            </p>
          </div>
        </div>

        <Separator />

        {/* Items */}
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" />
            Items Ordered
          </h2>
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm gap-2">
              <span className="text-muted-foreground">
                {item.product_name}
                {item.variant_name ? ` (${item.variant_name})` : ""}
                {" ×"}{item.qty}
                {item.greeting_message && (
                  <span className="block text-xs italic mt-0.5 text-foreground/70">
                    &quot;{item.greeting_message}&quot;
                  </span>
                )}
              </span>
              <span className="shrink-0 font-medium">{formatPrice(item.line_total_pkr)}</span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Delivery info per fulfillment */}
        {order.fulfillments.map((f) => (
          <div key={f.id} className="space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Delivery by {f.vendor_name}
            </h2>
            <div className="text-sm space-y-1 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {formatCalendarDate(f.delivery_date, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  {f.delivery_slot ? ` · ${f.delivery_slot}` : ""}
                </span>
              </div>
              <p>To: {f.recipient_name} · {f.recipient_phone}</p>
              <p>{f.address_line1}, {f.city_name}</p>
            </div>
          </div>
        ))}

        <Separator />

        {/* Totals */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatPrice(order.subtotal_pkr)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Delivery</span>
            <span>{formatPrice(order.delivery_pkr)}</span>
          </div>
          {order.discount_pkr > 0 && (
            <div className="flex justify-between text-success">
              <span>Discount</span>
              <span>-{formatPrice(order.discount_pkr)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-semibold text-base">
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
      </div>

      <GuestOrderNote />

      {/* Actions */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Button asChild className="flex-1 gap-2">
          <Link href={`/track/${order.public_token}`}>
            Track Order
            <ArrowRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <Button variant="outline" asChild className="flex-1">
          <Link href="/search">Continue Shopping</Link>
        </Button>
      </div>
    </div>
  );
}

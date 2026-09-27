import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle, Package, MapPin, Calendar, ArrowRight } from "lucide-react";
import { cartApi } from "@/lib/cart";
import { formatPrice } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ProofUpload } from "@/components/checkout/ProofUpload";
import { GuestOrderNote } from "@/components/checkout/GuestOrderNote";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { ShareTracking } from "@/components/orders/ShareTracking";
import { CopyButton } from "@/components/ui/copy-button";
import { orderNumber } from "@/lib/orders";
import { brand } from "@/lib/brand";

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
  const bankAccount = brand.bankAccountName;
  const bankIban = process.env.NEXT_PUBLIC_BANK_IBAN ?? null;

  const placedDate = new Date(order.placed_at).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      {/* Success banner */}
      <div className="mb-6 space-y-3 rounded-2xl border border-success/30 bg-success-soft px-6 py-8 text-center">
        <CheckCircle aria-hidden className="mx-auto h-12 w-12 text-success" />
        <h1 className="text-h1">
          {isBank ? "Order placed — one more step" : "Thank you! Your order is placed"}
        </h1>
        <p className="text-sm text-foreground-secondary">
          {isBank
            ? "Transfer the total and upload your receipt below so we can start preparing your gift."
            : "We'll confirm with the shop and let you know as your gift is prepared and delivered."}
        </p>
        <p className="inline-block rounded-lg bg-background px-3 py-1.5 text-sm">
          Order number <strong className="font-mono">{orderNumber(String(order.public_token))}</strong>
        </p>
      </div>

      {/* Bank transfer: the next action, so it comes first */}
      {isBank && (
        <section aria-labelledby="pay-heading" className="mb-6 space-y-4 rounded-xl border border-warning/40 bg-warning-soft p-5">
          <h2 id="pay-heading" className="text-h3">
            Pay by bank transfer
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <dt className="text-foreground-secondary">Amount</dt>
            <dd className="font-semibold">{formatPrice(order.total_pkr)}</dd>
            <dd className="hidden sm:block" />
            <dt className="text-foreground-secondary">Account</dt>
            <dd className="font-medium">{bankAccount}</dd>
            <dd className="hidden sm:block" />
            {bankIban && (
              <>
                <dt className="text-foreground-secondary">IBAN</dt>
                <dd className="break-all font-mono">{bankIban}</dd>
                <dd>
                  <CopyButton value={bankIban} label="IBAN" />
                </dd>
              </>
            )}
            <dt className="text-foreground-secondary">Reference</dt>
            <dd className="font-mono">{orderNumber(String(order.public_token))}</dd>
            <dd>
              <CopyButton value={orderNumber(String(order.public_token))} label="payment reference" />
            </dd>
          </dl>
          <ProofUpload orderId={String(order.id)} publicToken={String(order.public_token)} />
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
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
          <span className="text-sm font-medium">Share the tracking link:</span>
          <ShareTracking publicToken={String(order.public_token)} />
        </div>
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
                  {new Date(f.delivery_date).toLocaleDateString("en-PK", {
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

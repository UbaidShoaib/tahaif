import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle, Package, MapPin, Calendar, ArrowRight } from "lucide-react";
import { cartApi } from "@/lib/cart";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ProofUpload } from "@/components/checkout/ProofUpload";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pending Payment",
  paid: "Paid",
  preparing: "Preparing",
  dispatched: "Dispatched",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  on_hold: "On Hold",
};

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

  const placedDate = new Date(order.placed_at).toLocaleDateString("en-PK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      {/* Success banner */}
      <div className="rounded-2xl border border-primary-200 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-800 px-6 py-8 text-center mb-8 space-y-3">
        <CheckCircle className="h-12 w-12 mx-auto text-primary-600" />
        <h1 className="text-2xl font-bold">Order Placed Successfully!</h1>
        <p className="text-muted-foreground text-sm">
          We&apos;ve received your order and will confirm shortly.
        </p>
        <p className="font-mono text-xs bg-primary-100 dark:bg-primary-800/40 rounded-lg px-3 py-1.5 inline-block">
          Order #{order.public_token}
        </p>
      </div>

      {/* Order details */}
      <div className="rounded-xl border p-5 space-y-5">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Placed on</p>
            <p className="font-medium">{placedDate}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-medium">
              {STATUS_LABELS[order.status] ?? order.status}
            </p>
          </div>
          <div className="text-right">
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
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-{formatPrice(order.discount_pkr)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-semibold text-base">
            <span>Total</span>
            <span className="text-primary-600">{formatPrice(order.total_pkr)}</span>
          </div>
        </div>
      </div>

      {/* Bank transfer proof upload */}
      {order.payment_method === "bank_transfer" && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-5 space-y-3">
          <h3 className="font-semibold text-sm">Upload Payment Receipt</h3>
          <p className="text-xs text-muted-foreground">
            Transfer <span className="font-medium">{formatPrice(order.total_pkr)}</span> to our bank account
            and upload your receipt below. Bank details:
            <span className="block mt-1 font-mono text-foreground">
              IBAN: {process.env.NEXT_PUBLIC_BANK_IBAN ?? "—"}
            </span>
            <span className="block font-mono text-foreground">
              {process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME ?? "Tahaif Gifts — MCB Bank"}
            </span>
          </p>
          <ProofUpload orderId={String(order.id)} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Button asChild className="flex-1 gap-2">
          <Link href={`/track/${order.public_token}`}>
            Track Order
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" asChild className="flex-1">
          <Link href="/search">Continue Shopping</Link>
        </Button>
      </div>
    </div>
  );
}

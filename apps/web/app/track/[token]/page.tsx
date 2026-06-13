import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Package,
  MapPin,
  Calendar,
  CheckCircle,
  Clock,
  Truck,
  Gift,
  RotateCcw,
} from "lucide-react";
import { cartApi } from "@/lib/cart";
import { formatPrice } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return {
    title: `Track Order #${token.slice(0, 8).toUpperCase()} — Tahaif`,
  };
}

const STATUS_STEPS = [
  { key: "pending_payment", label: "Order Placed", icon: Gift },
  { key: "paid", label: "Payment Confirmed", icon: CheckCircle },
  { key: "preparing", label: "Preparing", icon: Package },
  { key: "dispatched", label: "Dispatched", icon: Truck },
  { key: "out_for_delivery", label: "Out for Delivery", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle },
];

const STATUS_ORDER = STATUS_STEPS.map((s) => s.key);

const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready for Dispatch",
  dispatched: "Dispatched",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
};

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

  const currentStep = STATUS_ORDER.indexOf(order.status);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Track Your Order</h1>
        <p className="text-muted-foreground text-sm mt-1 font-mono">
          #{order.public_token}
        </p>
      </div>

      {/* Status timeline */}
      <div className="rounded-xl border p-5 mb-6">
        <div className="relative">
          {/* Progress line */}
          <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-muted" />
          <div
            className="absolute left-4 top-4 w-0.5 bg-primary-600 transition-all duration-500"
            style={{
              height: currentStep >= 0
                ? `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%`
                : "0%",
            }}
          />

          <div className="space-y-6">
            {STATUS_STEPS.map((step, i) => {
              const isCompleted = i <= currentStep;
              const isCurrent = i === currentStep;
              const Icon = step.icon;
              return (
                <div key={step.key} className="flex items-center gap-4 relative">
                  <div
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isCompleted
                        ? "border-primary-600 bg-primary-600 text-white"
                        : "border-muted bg-background text-muted-foreground"
                    } ${isCurrent ? "ring-2 ring-primary-200 ring-offset-2" : ""}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.label}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-primary-600 font-medium">Current status</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Fulfillments */}
      {order.fulfillments.map((f) => (
        <div key={f.id} className="rounded-xl border p-5 mb-4 space-y-3">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Package className="h-4 w-4" />
              {f.vendor_name}
            </h2>
            <span className={`text-xs rounded-full px-2.5 py-1 font-medium ${
              f.status === "delivered"
                ? "bg-green-100 text-green-700"
                : f.status === "dispatched" || f.status === "out_for_delivery"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-muted text-muted-foreground"
            }`}>
              {FULFILLMENT_STATUS_LABELS[f.status] ?? f.status}
            </span>
          </div>

          <div className="text-sm space-y-1.5 text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                Delivery date:{" "}
                {new Date(f.delivery_date).toLocaleDateString("en-PK", {
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
                  Dispatched:{" "}
                  {new Date(f.dispatched_at).toLocaleString("en-PK", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
            {f.delivered_at && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>
                  Delivered:{" "}
                  {new Date(f.delivered_at).toLocaleString("en-PK", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}

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
          <span className="text-primary-600">{formatPrice(order.total_pkr)}</span>
        </div>
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

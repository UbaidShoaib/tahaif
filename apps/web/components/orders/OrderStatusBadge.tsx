import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  PackageCheck,
  PauseCircle,
  RotateCcw,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";

type Variant = NonNullable<BadgeProps["variant"]>;
type StatusMeta = { label: string; variant: Variant; icon: LucideIcon };

/** Order-level statuses (CLAUDE.md order status flow). */
export const ORDER_STATUS: Record<string, StatusMeta> = {
  pending_payment: { label: "Pending payment", variant: "warning", icon: CreditCard },
  paid: { label: "Paid", variant: "info", icon: CheckCircle2 },
  preparing: { label: "Preparing", variant: "brand", icon: ChefHat },
  dispatched: { label: "Dispatched", variant: "info", icon: Truck },
  out_for_delivery: { label: "Out for delivery", variant: "info", icon: Truck },
  delivered: { label: "Delivered", variant: "success", icon: PackageCheck },
  completed: { label: "Completed", variant: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "error", icon: Ban },
  refunded: { label: "Refunded", variant: "neutral", icon: RotateCcw },
  on_hold: { label: "On hold", variant: "warning", icon: PauseCircle },
};

/** Per-vendor fulfilment-leg statuses. */
export const FULFILLMENT_STATUS: Record<string, StatusMeta> = {
  pending: { label: "Pending", variant: "warning", icon: Clock },
  preparing: { label: "Preparing", variant: "brand", icon: ChefHat },
  ready: { label: "Ready for dispatch", variant: "info", icon: PackageCheck },
  dispatched: { label: "Dispatched", variant: "info", icon: Truck },
  out_for_delivery: { label: "Out for delivery", variant: "info", icon: Truck },
  delivered: { label: "Delivered", variant: "success", icon: PackageCheck },
  failed: { label: "Delivery failed", variant: "error", icon: AlertTriangle },
};

function humanize(status: string) {
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function statusLabel(status: string, kind: "order" | "fulfillment" = "order") {
  return (kind === "order" ? ORDER_STATUS : FULFILLMENT_STATUS)[status]?.label ?? humanize(status);
}

/** Status pill with icon + text; one source of truth for every status display. */
export function OrderStatusBadge({
  status,
  kind = "order",
  className,
}: {
  status: string;
  kind?: "order" | "fulfillment";
  className?: string;
}) {
  const meta = (kind === "order" ? ORDER_STATUS : FULFILLMENT_STATUS)[status];
  const Icon = meta?.icon ?? Clock;
  return (
    <Badge variant={meta?.variant ?? "neutral"} className={className}>
      <Icon aria-hidden />
      {meta?.label ?? humanize(status)}
    </Badge>
  );
}

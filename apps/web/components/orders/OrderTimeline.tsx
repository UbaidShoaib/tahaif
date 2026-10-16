import { Check, CheckCircle2, CreditCard, ChefHat, Gift, PackageCheck, Truck, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { cn } from "@/lib/utils";

const STEPS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "pending_payment", label: "Order placed", icon: Gift },
  { key: "paid", label: "Payment confirmed", icon: CreditCard },
  { key: "preparing", label: "Being prepared", icon: ChefHat },
  { key: "dispatched", label: "Dispatched", icon: Truck },
  { key: "out_for_delivery", label: "Out for delivery", icon: Truck },
  { key: "delivered", label: "Delivered", icon: PackageCheck },
];

const EXCEPTIONS: Record<string, string> = {
  cancelled: "This order was cancelled. If you didn't expect this, please contact us.",
  refunded: "This order was refunded.",
  on_hold: "This order is on hold. We'll contact you, or you can reach us to find out why.",
};

/**
 * Order progress as an ordered list. Each step says in text whether it's done,
 * current or upcoming (not just by colour), and the current step has
 * aria-current="step". "completed" counts as fully delivered; cancelled,
 * refunded and on-hold orders get an explanation instead of a misleading bar.
 */
export function OrderTimeline({ status }: { status: string }) {
  const exception = EXCEPTIONS[status];
  // Delivered is the last step, so it shows as done (a tick), not as "current".
  const finished = status === "delivered" || status === "completed";
  const current = finished ? STEPS.length - 1 : STEPS.findIndex((s) => s.key === status);

  if (exception) {
    return (
      <Alert variant={status === "on_hold" ? "warning" : "default"}>
        <AlertTitle className="flex items-center gap-2">
          <OrderStatusBadge status={status} />
        </AlertTitle>
        <AlertDescription>{exception}</AlertDescription>
      </Alert>
    );
  }

  return (
    <ol className="relative space-y-6" aria-label="Order progress">
      {STEPS.map((step, i) => {
        const state = i < current || finished ? "done" : i === current ? "current" : "upcoming";
        const Icon = state === "done" ? Check : step.icon;
        return (
          <li key={step.key} aria-current={state === "current" ? "step" : undefined} className="relative flex items-center gap-4">
            {/* Connector to the next step */}
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute start-4 top-8 h-6 w-0.5 -translate-x-1/2 rtl:translate-x-1/2",
                  state === "done" ? "bg-primary-700" : "bg-border",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                state === "done" && "border-primary-700 bg-primary-700 text-white",
                state === "current" && "border-primary bg-primary-soft text-primary-soft-foreground ring-2 ring-primary-200 ring-offset-2 ring-offset-background",
                state === "upcoming" && "border-input bg-background text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={state === "done" ? 3 : 2} />
            </span>
            <span>
              <span className={cn("block text-sm font-medium", state === "upcoming" && "text-muted-foreground")}>
                {step.label}
              </span>
              <span className={cn("block text-xs", state === "current" ? "font-medium text-link" : "sr-only")}>
                {state === "done" ? "Completed" : state === "current" ? "Current status" : "Upcoming"}
              </span>
            </span>
          </li>
        );
      })}
      {status === "completed" && (
        <li className="flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 aria-hidden className="h-4 w-4" /> Order completed
        </li>
      )}
    </ol>
  );
}

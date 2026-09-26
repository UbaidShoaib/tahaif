"use client";

import { useEffect, useState } from "react";
import { Clock, Truck } from "lucide-react";
import type { ProductCity } from "@/lib/catalog";
import { earliestDelivery, formatDeliveryDay } from "@/lib/delivery";
import { useDeliveryStore } from "@/stores/delivery.store";

/**
 * Earliest delivery for a product card, e.g. "Same-day" or "Tomorrow".
 * Rendered only after mount: it depends on the buyer's clock, which the
 * server can't know.
 */
export function DeliveryBadge({ pc }: { pc: ProductCity }) {
  const tz = useDeliveryStore((s) => s.cities.find((c) => c.id === pc.city_id)?.timezone) || "Asia/Karachi";
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  if (!now) return <span className="block h-5" aria-hidden />;

  const eta = earliestDelivery(pc, tz, now);
  if (eta.sameDay) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold-ink">
        <Clock aria-hidden className="h-3 w-3" />
        Same-day delivery
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Truck aria-hidden className="h-3 w-3" />
      Earliest {formatDeliveryDay(eta.date, tz, now)}
    </span>
  );
}
